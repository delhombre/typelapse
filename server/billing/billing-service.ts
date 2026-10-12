import type {
	BillingCadence,
	BillingCatalog,
	BillingEnvironment,
	BillingPrice,
} from "../../src/domain/ports/billing.port";

export type HostedPlanTier = "free" | "creator";
export type BillingSubscriptionStatus =
	| "incomplete"
	| "incomplete_expired"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid"
	| "paused";

export interface BillingProjection {
	readonly userId: string;
	readonly planTier: HostedPlanTier;
	readonly providerStatus: BillingSubscriptionStatus;
	readonly providerCustomerId: string;
	readonly providerSubscriptionId: string;
	readonly providerProductId: string;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
	readonly lastEventId: string;
	readonly lastEventCreatedAt: Date;
}

export interface NormalizedBillingEvent {
	/** The delivery id: a redelivery of the same event carries the same one. */
	readonly id: string;
	readonly type: string;
	readonly createdAt: Date;
	/** False for a sandbox event, so test money never reads as revenue. */
	readonly livemode: boolean;
	readonly payloadHash: string;
	readonly customerId?: string;
	readonly subscriptionId?: string;
	/** Our account id, which the provider hands back as the customer's external id. */
	readonly userId?: string;
}

export interface BillingSubscriptionState {
	readonly customerId: string;
	readonly subscriptionId: string;
	readonly productId: string;
	readonly status: BillingSubscriptionStatus;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
}

export interface BillingProjectionStore {
	findByUserId(userId: string): Promise<BillingProjection | null>;
	findUserIdByCustomerId(customerId: string): Promise<string | null>;
	/** Atomically claim the globally unique event id. False means already seen. */
	claimEvent(event: NormalizedBillingEvent): Promise<boolean>;
	/** Conditional write: the event cursor may never move backwards. */
	applyProjectionIfNewer(projection: BillingProjection): Promise<boolean>;
	finishEvent(
		id: string,
		status: "processed" | "ignored" | "failed",
		error?: string,
	): Promise<void>;
}

/** The webhook headers a delivery is verified against, as the HTTP layer received them. */
export type BillingWebhookHeaders = Readonly<Record<string, string | undefined>>;

/**
 * The payment provider (Polar, the merchant of record) behind one seam. Our
 * account id is the customer's external id on its side, so no provider id has
 * to be stored before the first checkout.
 */
export interface BillingGateway {
	/** Which Polar this gateway talks to: "sandbox" moves no real money. */
	readonly environment: BillingEnvironment;
	createCheckout(input: {
		readonly userId: string;
		readonly productId: string;
		readonly successUrl: string;
		readonly returnUrl: string;
	}): Promise<{ readonly id: string; readonly url: string }>;
	createPortal(input: {
		readonly userId: string;
		readonly returnUrl: string;
	}): Promise<{ readonly url: string }>;
	verifyWebhook(rawBody: string, headers: BillingWebhookHeaders): Promise<NormalizedBillingEvent>;
	retrieveSubscription(subscriptionId: string): Promise<BillingSubscriptionState>;
	retrieveProduct(productId: string): Promise<{
		readonly id: string;
		readonly currency: string;
		readonly unitAmount: number;
		readonly recurringInterval: "month" | "year";
	}>;
}

export interface BillingServiceConfig {
	readonly creatorProductIds: ReadonlyMap<BillingCadence, string>;
	readonly appUrl: string;
}

export interface BillingService {
	catalog(): Promise<BillingCatalog>;
	planFor(userId: string): Promise<{
		readonly tier: HostedPlanTier;
		/** "none" for an account that never subscribed. */
		readonly status: BillingSubscriptionStatus | "none";
		readonly currentPeriodEnd: Date | null;
		readonly cancelAtPeriodEnd: boolean;
		/** When the last billing event that moved this account arrived. */
		readonly since: Date | null;
	}>;
	startCheckout(
		userId: string,
		cadence: BillingCadence,
	): Promise<{ readonly id: string; readonly url: string }>;
	openPortal(userId: string): Promise<{ readonly url: string }>;
	processWebhook(
		rawBody: string,
		headers: BillingWebhookHeaders,
	): Promise<{ readonly outcome: "processed" | "duplicate" | "ignored" }>;
}

export class InvalidBillingWebhookSignatureError extends Error {
	constructor() {
		super("Invalid billing webhook signature");
		this.name = "InvalidBillingWebhookSignatureError";
	}
}

/** One projection row per account: a second paid checkout would start a second subscription beside the first. */
export class AlreadySubscribedError extends Error {
	constructor() {
		super("This account already has Creator");
		this.name = "AlreadySubscribedError";
	}
}

function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

/** The events that can move a plan; Polar sends many more (checkouts, benefits, customers). */
const RELEVANT_EVENTS: ReadonlySet<string> = new Set([
	"subscription.active",
	"subscription.updated",
	"subscription.canceled",
	"subscription.uncanceled",
	"subscription.revoked",
	"subscription.past_due",
	"order.paid",
]);

function isRelevantEvent(type: string): boolean {
	return RELEVANT_EVENTS.has(type);
}

/** Domain-owned billing orchestration; the provider SDK and SQL stay in adapters. */
export function createBillingService(input: {
	readonly store: BillingProjectionStore;
	readonly gateway: BillingGateway;
	readonly config: BillingServiceConfig;
}): BillingService {
	const { store, gateway, config } = input;
	const appUrl = trimTrailingSlash(config.appUrl);
	let catalogRequest: Promise<BillingCatalog> | null = null;
	const configuredProductIds = new Set(config.creatorProductIds.values());

	const catalog = async (): Promise<BillingCatalog> => {
		const entries = await Promise.all(
			([...config.creatorProductIds] as const).map(async ([cadence, productId]) => {
				const product = await gateway.retrieveProduct(productId);
				const expectedInterval = cadence === "monthly" ? "month" : "year";
				if (
					product.id !== productId ||
					product.recurringInterval !== expectedInterval ||
					!Number.isSafeInteger(product.unitAmount) ||
					product.unitAmount <= 0 ||
					!/^[a-z]{3}$/i.test(product.currency)
				) {
					throw new Error(
						`Billing product ${productId} does not match the configured cadence`,
					);
				}
				const normalized: BillingPrice = {
					currency: product.currency.toUpperCase(),
					unitAmount: product.unitAmount,
				};
				return [cadence, normalized] as const;
			}),
		);
		return { creator: Object.fromEntries(entries), environment: gateway.environment };
	};

	return {
		async catalog() {
			catalogRequest ??= catalog().catch((error) => {
				catalogRequest = null;
				throw error;
			});
			return catalogRequest;
		},
		async planFor(userId) {
			const projection = await store.findByUserId(userId);
			return {
				tier: projection?.planTier ?? "free",
				currentPeriodEnd: projection?.currentPeriodEnd ?? null,
				cancelAtPeriodEnd: projection?.cancelAtPeriodEnd ?? false,
				status: projection?.providerStatus ?? "none",
				since: projection?.lastEventCreatedAt ?? null,
			};
		},

		async startCheckout(userId, cadence) {
			const productId = config.creatorProductIds.get(cadence);
			if (!productId) {
				throw new Error(`Creator ${cadence} billing is not configured`);
			}
			// Creator, or a payment that failed on its subscription: the portal is the fix
			// for both, and the island offers nothing else, so the API agrees.
			const projection = await store.findByUserId(userId);
			if (
				projection?.planTier === "creator" ||
				projection?.providerStatus === "past_due" ||
				projection?.providerStatus === "unpaid"
			) {
				throw new AlreadySubscribedError();
			}
			return gateway.createCheckout({
				userId,
				productId,
				successUrl: `${appUrl}/app?billing=success`,
				returnUrl: `${appUrl}/app?billing=cancelled`,
			});
		},

		async openPortal(userId) {
			const projection = await store.findByUserId(userId);
			if (!projection?.providerCustomerId) {
				throw new Error("No billing customer is associated with this account");
			}
			return gateway.createPortal({
				userId,
				returnUrl: `${appUrl}/app`,
			});
		},

		async processWebhook(rawBody, headers) {
			const event = await gateway.verifyWebhook(rawBody, headers);
			const claimed = await store.claimEvent(event);
			if (!claimed) {
				return { outcome: "duplicate" };
			}

			try {
				if (!isRelevantEvent(event.type) || !event.customerId || !event.subscriptionId) {
					await store.finishEvent(event.id, "ignored");
					return { outcome: "ignored" };
				}
				const userId = event.userId ?? (await store.findUserIdByCustomerId(event.customerId));
				if (!userId) {
					await store.finishEvent(event.id, "ignored");
					return { outcome: "ignored" };
				}

				// Refresh the provider's current object instead of trusting delivery order.
				const subscription = await gateway.retrieveSubscription(event.subscriptionId);
				const entitled =
					configuredProductIds.has(subscription.productId) &&
					(subscription.status === "active" || subscription.status === "trialing");
				// An account holds one projection row. A subscription other than the one it
				// is paying on (an old one revoked late) must not take Creator away.
				const current = await store.findByUserId(userId);
				if (
					!entitled &&
					current?.planTier === "creator" &&
					current.providerSubscriptionId !== subscription.subscriptionId
				) {
					await store.finishEvent(event.id, "ignored");
					return { outcome: "ignored" };
				}
				await store.applyProjectionIfNewer({
					userId,
					planTier: entitled ? "creator" : "free",
					providerStatus: subscription.status,
					providerCustomerId: subscription.customerId,
					providerSubscriptionId: subscription.subscriptionId,
					providerProductId: subscription.productId,
					currentPeriodEnd: subscription.currentPeriodEnd,
					cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
					lastEventId: event.id,
					lastEventCreatedAt: event.createdAt,
				});
				await store.finishEvent(event.id, "processed");
				return { outcome: "processed" };
			} catch (error) {
				const message = error instanceof Error ? error.message : "Billing webhook failed";
				await store.finishEvent(event.id, "failed", message);
				throw error;
			}
		},
	};
}
