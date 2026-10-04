import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type {
	BillingProjection,
	BillingProjectionStore,
	NormalizedStripeEvent,
} from "../billing/billing-service";
import { stripeWebhookEvents, subscriptionProjections } from "./creator-schema";
import type { CreatorDatabase } from "./database";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

type ProjectionRow = typeof subscriptionProjections.$inferSelect;

export function billingProjectionFromRow(row: ProjectionRow): BillingProjection | null {
	if (
		row.stripeStatus === "none" ||
		!row.stripeCustomerId ||
		!row.stripeSubscriptionId ||
		!row.stripePriceId ||
		!row.lastEventId ||
		!row.lastEventCreatedAt
	) {
		return null;
	}
	return {
		userId: row.userId,
		planTier: row.planTier,
		stripeStatus: row.stripeStatus,
		stripeCustomerId: row.stripeCustomerId,
		stripeSubscriptionId: row.stripeSubscriptionId,
		stripePriceId: row.stripePriceId,
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
				.where(eq(subscriptionProjections.stripeCustomerId, customerId))
				.limit(1);
			return row?.userId ?? null;
		},

		async claimEvent(event: NormalizedStripeEvent) {
			const claimedAt = now();
			const staleBefore = new Date(claimedAt.getTime() - PROCESSING_LEASE_MS);
			const claimed = await db
				.insert(stripeWebhookEvents)
				.values({
					id: event.id,
					type: event.type,
					livemode: event.livemode,
					stripeCreatedAt: event.createdAt,
					payloadHash: event.payloadHash,
					status: "processing",
					attempts: 1,
					receivedAt: claimedAt,
				})
				.onConflictDoUpdate({
					target: stripeWebhookEvents.id,
					set: {
						status: "processing",
						attempts: sql`${stripeWebhookEvents.attempts} + 1`,
						receivedAt: claimedAt,
						processedAt: null,
						lastError: null,
					},
					setWhere: and(
						eq(stripeWebhookEvents.payloadHash, event.payloadHash),
						or(
							eq(stripeWebhookEvents.status, "failed"),
							and(
								eq(stripeWebhookEvents.status, "processing"),
								lt(stripeWebhookEvents.receivedAt, staleBefore),
							),
						),
					),
				})
				.returning({ id: stripeWebhookEvents.id });
			return claimed.length > 0;
		},

		async applyProjectionIfNewer(projection) {
			const rows = await db
				.insert(subscriptionProjections)
				.values({
					userId: projection.userId,
					planTier: projection.planTier,
					stripeStatus: projection.stripeStatus,
					stripeCustomerId: projection.stripeCustomerId,
					stripeSubscriptionId: projection.stripeSubscriptionId,
					stripePriceId: projection.stripePriceId,
					currentPeriodEnd: projection.currentPeriodEnd,
					cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
					lastEventId: projection.lastEventId,
					lastEventCreatedAt: projection.lastEventCreatedAt,
				})
				.onConflictDoUpdate({
					target: subscriptionProjections.userId,
					set: {
						planTier: projection.planTier,
						stripeStatus: projection.stripeStatus,
						stripeCustomerId: projection.stripeCustomerId,
						stripeSubscriptionId: projection.stripeSubscriptionId,
						stripePriceId: projection.stripePriceId,
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
				.update(stripeWebhookEvents)
				.set({
					status,
					processedAt: status === "processed" || status === "ignored" ? terminalAt : null,
					lastError: status === "failed" ? error ?? "Billing webhook failed" : null,
				})
				.where(
					and(eq(stripeWebhookEvents.id, id), eq(stripeWebhookEvents.status, "processing")),
				)
				.returning({ id: stripeWebhookEvents.id });
			if (rows.length === 0) {
				throw new Error("Billing webhook event is not in a claimable processing state");
			}
		},
	};
}
