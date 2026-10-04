import type {
	BillingCadence,
	BillingCatalog,
	BillingPrice,
} from "../../src/domain/ports/billing.port";

export type HostedPlanTier = "free" | "creator";
export type StripeSubscriptionStateName =
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
	readonly stripeStatus: StripeSubscriptionStateName;
	readonly stripeCustomerId: string;
	readonly stripeSubscriptionId: string;
	readonly stripePriceId: string;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
	readonly lastEventId: string;
	readonly lastEventCreatedAt: Date;
}

export interface NormalizedStripeEvent {
	readonly id: string;
	readonly type: string;
	readonly createdAt: Date;
	readonly livemode: boolean;
	readonly payloadHash: string;
	readonly customerId?: string;
	readonly subscriptionId?: string;
	/** Present only on Checkout, copied from our server-owned client reference. */
	readonly userId?: string;
}

export interface StripeSubscriptionState {
	readonly customerId: string;
	readonly subscriptionId: string;
	readonly priceId: string;
	readonly status: StripeSubscriptionStateName;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
}

export interface BillingProjectionStore {
	findByUserId(userId: string): Promise<BillingProjection | null>;
	findUserIdByCustomerId(customerId: string): Promise<string | null>;
	/** Atomically claim the globally unique event id. False means already seen. */
	claimEvent(event: NormalizedStripeEvent): Promise<boolean>;
	/** Conditional write: the event cursor may never move backwards. */
	applyProjectionIfNewer(projection: BillingProjection): Promise<boolean>;
	finishEvent(
		id: string,
		status: "processed" | "ignored" | "failed",
		error?: string,
	): Promise<void>;
}

export interface StripeBillingGateway {
	createCheckout(input: {
		readonly userId: string;
		readonly customerId?: string;
		readonly priceId: string;
		readonly successUrl: string;
		readonly cancelUrl: string;
	}): Promise<{ readonly id: string; readonly url: string }>;
	createPortal(input: {
		readonly customerId: string;
		readonly returnUrl: string;
	}): Promise<{ readonly url: string }>;
	verifyWebhook(rawBody: string, signature: string): Promise<NormalizedStripeEvent>;
	retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionState>;
	retrievePrice(priceId: string): Promise<{
		readonly id: string;
		readonly currency: string;
		readonly unitAmount: number;
		readonly recurringInterval: "month" | "year";
	}>;
}

export interface BillingServiceConfig {
	readonly creatorPriceIds: ReadonlyMap<BillingCadence, string>;
	readonly appUrl: string;
}

export interface BillingService {
	catalog(): Promise<BillingCatalog>;
	planFor(userId: string): Promise<{
		readonly tier: HostedPlanTier;
		readonly currentPeriodEnd: Date | null;
		readonly cancelAtPeriodEnd: boolean;
	}>;
	startCheckout(
		userId: string,
		cadence: BillingCadence,
	): Promise<{ readonly id: string; readonly url: string }>;
	openPortal(userId: string): Promise<{ readonly url: string }>;
	processWebhook(
		rawBody: string,
		signature: string,
	): Promise<{ readonly outcome: "processed" | "duplicate" | "ignored" }>;
}

export class InvalidBillingWebhookSignatureError extends Error {
	constructor() {
		super("Invalid Stripe webhook signature");
		this.name = "InvalidBillingWebhookSignatureError";
	}
}

function trimTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isRelevantEvent(type: string): boolean {
	return type === "checkout.session.completed" || type.startsWith("customer.subscription.");
}

/** Domain-owned billing orchestration; the Stripe SDK and SQL stay in adapters. */
export function createBillingService(input: {
	readonly store: BillingProjectionStore;
	readonly stripe: StripeBillingGateway;
	readonly config: BillingServiceConfig;
}): BillingService {
	const { store, stripe, config } = input;
	const appUrl = trimTrailingSlash(config.appUrl);
	let catalogRequest: Promise<BillingCatalog> | null = null;
	const configuredPriceIds = new Set(config.creatorPriceIds.values());

	const catalog = async (): Promise<BillingCatalog> => {
		const entries = await Promise.all(
			([...config.creatorPriceIds] as const).map(async ([cadence, priceId]) => {
				const price = await stripe.retrievePrice(priceId);
				const expectedInterval = cadence === "monthly" ? "month" : "year";
				if (
					price.id !== priceId ||
					price.recurringInterval !== expectedInterval ||
					!Number.isSafeInteger(price.unitAmount) ||
					price.unitAmount <= 0 ||
					!/^[a-z]{3}$/i.test(price.currency)
				) {
					throw new Error(`Stripe price ${priceId} does not match the configured cadence`);
				}
				const normalized: BillingPrice = {
					currency: price.currency.toUpperCase(),
					unitAmount: price.unitAmount,
				};
				return [cadence, normalized] as const;
			}),
		);
		return { creator: Object.fromEntries(entries) };
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
			};
		},

		async startCheckout(userId, cadence) {
			const priceId = config.creatorPriceIds.get(cadence);
			if (!priceId) {
				throw new Error(`Creator ${cadence} billing is not configured`);
			}
			const projection = await store.findByUserId(userId);
			return stripe.createCheckout({
				userId,
				customerId: projection?.stripeCustomerId,
				priceId,
				successUrl: `${appUrl}/app?billing=success`,
				cancelUrl: `${appUrl}/app?billing=cancelled`,
			});
		},

		async openPortal(userId) {
			const projection = await store.findByUserId(userId);
			if (!projection?.stripeCustomerId) {
				throw new Error("No Stripe customer is associated with this account");
			}
			return stripe.createPortal({
				customerId: projection.stripeCustomerId,
				returnUrl: `${appUrl}/app`,
			});
		},

		async processWebhook(rawBody, signature) {
			const event = await stripe.verifyWebhook(rawBody, signature);
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
				const subscription = await stripe.retrieveSubscription(event.subscriptionId);
				const entitled =
					configuredPriceIds.has(subscription.priceId) &&
					(subscription.status === "active" || subscription.status === "trialing");
				await store.applyProjectionIfNewer({
					userId,
					planTier: entitled ? "creator" : "free",
					stripeStatus: subscription.status,
					stripeCustomerId: subscription.customerId,
					stripeSubscriptionId: subscription.subscriptionId,
					stripePriceId: subscription.priceId,
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
