import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type {
	BillingProjection,
	BillingProjectionStore,
	NormalizedBillingEvent,
} from "../billing/billing-service";
import { billingWebhookEvents, subscriptionProjections } from "./creator-schema";
import type { CreatorDatabase } from "./database";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

type ProjectionRow = typeof subscriptionProjections.$inferSelect;

export function billingProjectionFromRow(row: ProjectionRow): BillingProjection | null {
	if (
		row.providerStatus === "none" ||
		!row.providerCustomerId ||
		!row.providerSubscriptionId ||
		!row.providerProductId ||
		!row.lastEventId ||
		!row.lastEventCreatedAt
	) {
		return null;
	}
	return {
		userId: row.userId,
		planTier: row.planTier,
		providerStatus: row.providerStatus,
		providerCustomerId: row.providerCustomerId,
		providerSubscriptionId: row.providerSubscriptionId,
		providerProductId: row.providerProductId,
		currentPeriodEnd: row.currentPeriodEnd,
		cancelAtPeriodEnd: row.cancelAtPeriodEnd,
		lastEventId: row.lastEventId,
		lastEventCreatedAt: row.lastEventCreatedAt,
	};
}

/** Durable idempotency ledger and fail-closed subscription projection. */
export function createBillingProjectionStore(input: {
	readonly db: CreatorDatabase;
	readonly now?: () => Date;
}): BillingProjectionStore {
	const { db, now = () => new Date() } = input;
	return {
		async findByUserId(userId) {
			const [row] = await db
				.select()
				.from(subscriptionProjections)
				.where(eq(subscriptionProjections.userId, userId))
				.limit(1);
			return row ? billingProjectionFromRow(row) : null;
		},

		async findUserIdByCustomerId(customerId) {
			const [row] = await db
				.select({ userId: subscriptionProjections.userId })
				.from(subscriptionProjections)
				.where(eq(subscriptionProjections.providerCustomerId, customerId))
				.limit(1);
			return row?.userId ?? null;
		},

		async claimEvent(event: NormalizedBillingEvent) {
			const claimedAt = now();
			const staleBefore = new Date(claimedAt.getTime() - PROCESSING_LEASE_MS);
			const claimed = await db
				.insert(billingWebhookEvents)
				.values({
					id: event.id,
					type: event.type,
					livemode: event.livemode,
					providerCreatedAt: event.createdAt,
					payloadHash: event.payloadHash,
					status: "processing",
					attempts: 1,
					receivedAt: claimedAt,
				})
				.onConflictDoUpdate({
					target: billingWebhookEvents.id,
					set: {
						status: "processing",
						attempts: sql`${billingWebhookEvents.attempts} + 1`,
						receivedAt: claimedAt,
						processedAt: null,
						lastError: null,
					},
					setWhere: and(
						eq(billingWebhookEvents.payloadHash, event.payloadHash),
						or(
							eq(billingWebhookEvents.status, "failed"),
							and(
								eq(billingWebhookEvents.status, "processing"),
								lt(billingWebhookEvents.receivedAt, staleBefore),
							),
						),
					),
				})
				.returning({ id: billingWebhookEvents.id });
			return claimed.length > 0;
		},

		async applyProjectionIfNewer(projection) {
			const rows = await db
				.insert(subscriptionProjections)
				.values({
					userId: projection.userId,
					planTier: projection.planTier,
					providerStatus: projection.providerStatus,
					providerCustomerId: projection.providerCustomerId,
					providerSubscriptionId: projection.providerSubscriptionId,
					providerProductId: projection.providerProductId,
					currentPeriodEnd: projection.currentPeriodEnd,
					cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
					lastEventId: projection.lastEventId,
					lastEventCreatedAt: projection.lastEventCreatedAt,
				})
				.onConflictDoUpdate({
					target: subscriptionProjections.userId,
					set: {
						planTier: projection.planTier,
						providerStatus: projection.providerStatus,
						providerCustomerId: projection.providerCustomerId,
						providerSubscriptionId: projection.providerSubscriptionId,
						providerProductId: projection.providerProductId,
						currentPeriodEnd: projection.currentPeriodEnd,
						cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
						lastEventId: projection.lastEventId,
						lastEventCreatedAt: projection.lastEventCreatedAt,
						updatedAt: now(),
					},
					setWhere: or(
						isNull(subscriptionProjections.lastEventCreatedAt),
						lt(subscriptionProjections.lastEventCreatedAt, projection.lastEventCreatedAt),
						and(
							eq(
								subscriptionProjections.lastEventCreatedAt,
								projection.lastEventCreatedAt,
							),
							ne(subscriptionProjections.lastEventId, projection.lastEventId),
						),
					),
				})
				.returning({ userId: subscriptionProjections.userId });
			return rows.length > 0;
		},

		async finishEvent(id, status, error) {
			const terminalAt = now();
			const rows = await db
				.update(billingWebhookEvents)
				.set({
					status,
					processedAt: status === "processed" || status === "ignored" ? terminalAt : null,
					lastError: status === "failed" ? error ?? "Billing webhook failed" : null,
				})
				.where(
					and(eq(billingWebhookEvents.id, id), eq(billingWebhookEvents.status, "processing")),
				)
				.returning({ id: billingWebhookEvents.id });
			if (rows.length === 0) {
				throw new Error("Billing webhook event is not in a claimable processing state");
			}
		},
	};
}
