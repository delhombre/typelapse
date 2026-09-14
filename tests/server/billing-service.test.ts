import { describe, expect, it } from "vitest";
import {
	type BillingProjection,
	type BillingProjectionStore,
	createBillingService,
	type NormalizedStripeEvent,
	type StripeBillingGateway,
	type StripeSubscriptionState,
} from "../../server/billing/billing-service";

const EVENT_TIME = new Date("2026-08-30T20:00:00.000Z");

class MemoryBillingStore implements BillingProjectionStore {
	readonly projections = new Map<string, BillingProjection>();
	readonly customers = new Map<string, string>();
	readonly events = new Map<string, "processing" | "processed" | "ignored" | "failed">();

	async findByUserId(userId: string): Promise<BillingProjection | null> {
		return this.projections.get(userId) ?? null;
	}

	async findUserIdByCustomerId(customerId: string): Promise<string | null> {
		return this.customers.get(customerId) ?? null;
	}

	async claimEvent(event: NormalizedStripeEvent): Promise<boolean> {
		const current = this.events.get(event.id);
		if (current && current !== "failed") {
			return false;
		}
		this.events.set(event.id, "processing");
		return true;
	}

	async applyProjectionIfNewer(projection: BillingProjection): Promise<boolean> {
		const current = this.projections.get(projection.userId);
		if (
			current &&
			projection.lastEventCreatedAt.getTime() < current.lastEventCreatedAt.getTime()
		) {
			return false;
		}
		this.projections.set(projection.userId, projection);
		if (projection.stripeCustomerId) {
			this.customers.set(projection.stripeCustomerId, projection.userId);
		}
		return true;
	}

	async finishEvent(
		id: string,
		status: "processed" | "ignored" | "failed",
		_error?: string,
	): Promise<void> {
		this.events.set(id, status);
	}
}

class FakeStripe implements StripeBillingGateway {
	checkoutInput: Parameters<StripeBillingGateway["createCheckout"]>[0] | null = null;
	portalInput: Parameters<StripeBillingGateway["createPortal"]>[0] | null = null;
	event: NormalizedStripeEvent = {
		id: "evt_1",
		type: "customer.subscription.updated",
		createdAt: EVENT_TIME,
		livemode: false,
		payloadHash: "a".repeat(64),
		customerId: "cus_1",
		subscriptionId: "sub_1",
	};
	subscription: StripeSubscriptionState = {
		customerId: "cus_1",
		subscriptionId: "sub_1",
		priceId: "price_creator_monthly",
		status: "active",
		currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
		cancelAtPeriodEnd: false,
	};
	retrievals = 0;
	priceRetrievals: string[] = [];

	async createCheckout(input: Parameters<StripeBillingGateway["createCheckout"]>[0]) {
		this.checkoutInput = input;
		return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
	}

	async createPortal(input: Parameters<StripeBillingGateway["createPortal"]>[0]) {
		this.portalInput = input;
		return { url: "https://billing.stripe.test/session" };
	}

	async verifyWebhook(): Promise<NormalizedStripeEvent> {
		return this.event;
	}

	async retrieveSubscription(): Promise<StripeSubscriptionState> {
		this.retrievals += 1;
		return this.subscription;
	}

	async retrievePrice(priceId: string) {
		this.priceRetrievals.push(priceId);
		return priceId.endsWith("annual")
			? { id: priceId, currency: "eur", unitAmount: 12000, recurringInterval: "year" as const }
			: { id: priceId, currency: "eur", unitAmount: 1200, recurringInterval: "month" as const };
	}
}

function service(store = new MemoryBillingStore(), stripe = new FakeStripe()) {
	return {
		store,
		stripe,
		billing: createBillingService({
			store,
			stripe,
			config: {
				creatorPriceIds: new Map([
					["monthly", "price_creator_monthly"],
					["annual", "price_creator_annual"],
				]),
				appUrl: "https://typelapse.test",
			},
		}),
	};
}

describe("billing service", () => {
	it("creates Checkout from server-owned product and return URLs", async () => {
		const { billing, stripe } = service();

		const session = await billing.startCheckout("user-1", "monthly");

		expect(session).toEqual({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
		expect(stripe.checkoutInput).toEqual({
			userId: "user-1",
			customerId: undefined,
			priceId: "price_creator_monthly",
			successUrl: "https://typelapse.test/app?billing=success",
			cancelUrl: "https://typelapse.test/app?billing=cancelled",
		});
	});

	it("creates annual Checkout only from the server-owned annual price", async () => {
		const { billing, stripe } = service();

		await billing.startCheckout("user-1", "annual");

		expect(stripe.checkoutInput?.priceId).toBe("price_creator_annual");
	});

	it("publishes a Stripe-authoritative Creator catalog and caches the stable prices", async () => {
		const { billing, stripe } = service();

		const first = await billing.catalog();
		const second = await billing.catalog();

		expect(first).toEqual({
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		});
		expect(second).toEqual(first);
		expect(stripe.priceRetrievals).toEqual([
			"price_creator_monthly",
			"price_creator_annual",
		]);
	});

	it("opens the Customer Portal only for an associated Stripe customer", async () => {
		const { billing, store, stripe } = service();
		store.projections.set("user-1", {
			userId: "user-1",
			planTier: "free",
			stripeStatus: "canceled",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_1",
			stripePriceId: "price_creator_monthly",
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			lastEventId: "evt_0",
			lastEventCreatedAt: new Date(0),
		});

		await billing.openPortal("user-1");

		expect(stripe.portalInput).toEqual({
			customerId: "cus_1",
			returnUrl: "https://typelapse.test/app",
		});
		await expect(service().billing.openPortal("unknown")).rejects.toThrow(
			"No Stripe customer",
		);
	});

	it("verifies and claims a webhook once before refreshing Stripe state", async () => {
		const { billing, store, stripe } = service();
		store.customers.set("cus_1", "user-1");

		const first = await billing.processWebhook("raw", "signature");
		const duplicate = await billing.processWebhook("raw", "signature");

		expect(first).toEqual({ outcome: "processed" });
		expect(duplicate).toEqual({ outcome: "duplicate" });
		expect(stripe.retrievals).toBe(1);
		expect(store.events.get("evt_1")).toBe("processed");
		expect(store.projections.get("user-1")).toMatchObject({
			planTier: "creator",
			stripeStatus: "active",
		});
	});

	it("uses Checkout metadata to establish the first customer association", async () => {
		const { billing, store, stripe } = service();
		stripe.event = {
			...stripe.event,
			id: "evt_checkout",
			type: "checkout.session.completed",
			userId: "user-new",
		};

		await billing.processWebhook("raw", "signature");

		expect(store.customers.get("cus_1")).toBe("user-new");
		expect(store.projections.get("user-new")?.planTier).toBe("creator");
	});

	it("never regresses a projection when Stripe delivers an older event", async () => {
		const { billing, store, stripe } = service();
		store.customers.set("cus_1", "user-1");
		store.projections.set("user-1", {
			userId: "user-1",
			planTier: "creator",
			stripeStatus: "active",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_1",
			stripePriceId: "price_creator_monthly",
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			lastEventId: "evt_new",
			lastEventCreatedAt: new Date("2026-08-30T21:00:00.000Z"),
		});
		stripe.event = { ...stripe.event, id: "evt_old", createdAt: EVENT_TIME };
		stripe.subscription = { ...stripe.subscription, status: "canceled" };

		await billing.processWebhook("raw", "signature");

		expect(store.projections.get("user-1")?.planTier).toBe("creator");
		expect(store.events.get("evt_old")).toBe("processed");
	});

	it("ignores an event that cannot be associated with a Typelapse user", async () => {
		const { billing, store, stripe } = service();

		const result = await billing.processWebhook("raw", "signature");

		expect(result).toEqual({ outcome: "ignored" });
		expect(stripe.retrievals).toBe(0);
		expect(store.events.get("evt_1")).toBe("ignored");
	});

	it("retries a previously failed event without treating it as a duplicate", async () => {
		const { billing, store, stripe } = service();
		store.customers.set("cus_1", "user-1");
		stripe.retrieveSubscription = async () => {
			stripe.retrievals += 1;
			if (stripe.retrievals === 1) {
				throw new Error("Temporary Stripe outage");
			}
			return stripe.subscription;
		};

		await expect(billing.processWebhook("raw", "signature")).rejects.toThrow(
			"Temporary Stripe outage",
		);
		expect(store.events.get("evt_1")).toBe("failed");

		await expect(billing.processWebhook("raw", "signature")).resolves.toEqual({
			outcome: "processed",
		});
		expect(store.events.get("evt_1")).toBe("processed");
		expect(stripe.retrievals).toBe(2);
	});
});
