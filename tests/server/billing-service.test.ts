import { describe, expect, it } from "vitest";
import {
	type BillingProjection,
	type BillingProjectionStore,
	createBillingService,
	type NormalizedBillingEvent,
	type BillingGateway,
	type BillingSubscriptionState,
} from "../../server/billing/billing-service";

const HEADERS = { "webhook-id": "wh_1" };
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

	async claimEvent(event: NormalizedBillingEvent): Promise<boolean> {
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
		if (projection.providerCustomerId) {
			this.customers.set(projection.providerCustomerId, projection.userId);
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

class FakePolar implements BillingGateway {
	checkoutInput: Parameters<BillingGateway["createCheckout"]>[0] | null = null;
	portalInput: Parameters<BillingGateway["createPortal"]>[0] | null = null;
	event: NormalizedBillingEvent = {
		id: "evt_1",
		type: "subscription.updated",
		createdAt: EVENT_TIME,
		livemode: false,
		payloadHash: "a".repeat(64),
		customerId: "cus_1",
		subscriptionId: "sub_1",
	};
	subscription: BillingSubscriptionState = {
		customerId: "cus_1",
		subscriptionId: "sub_1",
		productId: "prod_creator_monthly",
		status: "active",
		currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
		cancelAtPeriodEnd: false,
	};
	retrievals = 0;
	productRetrievals: string[] = [];

	async createCheckout(input: Parameters<BillingGateway["createCheckout"]>[0]) {
		this.checkoutInput = input;
		return { id: "cs_1", url: "https://checkout.polar.test/cs_1" };
	}

	async createPortal(input: Parameters<BillingGateway["createPortal"]>[0]) {
		this.portalInput = input;
		return { url: "https://billing.polar.test/session" };
	}

	async verifyWebhook(): Promise<NormalizedBillingEvent> {
		return this.event;
	}

	async retrieveSubscription(): Promise<BillingSubscriptionState> {
		this.retrievals += 1;
		return this.subscription;
	}

	async retrieveProduct(productId: string) {
		this.productRetrievals.push(productId);
		return productId.endsWith("annual")
			? { id: productId, currency: "usd", unitAmount: 9900, recurringInterval: "year" as const }
			: { id: productId, currency: "usd", unitAmount: 1200, recurringInterval: "month" as const };
	}
}

function service(store = new MemoryBillingStore(), polar = new FakePolar()) {
	return {
		store,
		polar,
		billing: createBillingService({
			store,
			gateway: polar,
			config: {
				creatorProductIds: new Map([
					["monthly", "prod_creator_monthly"],
					["annual", "prod_creator_annual"],
				]),
				appUrl: "https://typelapse.test",
			},
		}),
	};
}

describe("billing service", () => {
	it("creates Checkout from server-owned product and return URLs", async () => {
		const { billing, polar } = service();

		const session = await billing.startCheckout("user-1", "monthly");

		expect(session).toEqual({ id: "cs_1", url: "https://checkout.polar.test/cs_1" });
		expect(polar.checkoutInput).toEqual({
			userId: "user-1",
			productId: "prod_creator_monthly",
			successUrl: "https://typelapse.test/app?billing=success",
			returnUrl: "https://typelapse.test/app?billing=cancelled",
		});
	});

	it("creates annual Checkout only from the server-owned annual price", async () => {
		const { billing, polar } = service();

		await billing.startCheckout("user-1", "annual");

		expect(polar.checkoutInput?.productId).toBe("prod_creator_annual");
	});

	it("publishes a Polar-authoritative Creator catalog from the two products and caches the stable prices", async () => {
		const { billing, polar } = service();

		const first = await billing.catalog();
		const second = await billing.catalog();

		expect(first).toEqual({
			creator: {
				monthly: { currency: "USD", unitAmount: 1200 },
				annual: { currency: "USD", unitAmount: 9900 },
			},
		});
		expect(second).toEqual(first);
		expect(polar.productRetrievals).toEqual([
			"prod_creator_monthly",
			"prod_creator_annual",
		]);
	});

	it("opens the customer portal for the account, and only once it has a billing customer", async () => {
		const { billing, store, polar } = service();
		store.projections.set("user-1", {
			userId: "user-1",
			planTier: "free",
			providerStatus: "canceled",
			providerCustomerId: "cus_1",
			providerSubscriptionId: "sub_1",
			providerProductId: "prod_creator_monthly",
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			lastEventId: "evt_0",
			lastEventCreatedAt: new Date(0),
		});

		await billing.openPortal("user-1");

		expect(polar.portalInput).toEqual({
			userId: "user-1",
			returnUrl: "https://typelapse.test/app",
		});
		await expect(service().billing.openPortal("unknown")).rejects.toThrow(
			"No billing customer",
		);
	});

	it("verifies and claims a webhook once before refreshing the subscription from Polar", async () => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");

		const first = await billing.processWebhook("raw", HEADERS);
		const duplicate = await billing.processWebhook("raw", HEADERS);

		expect(first).toEqual({ outcome: "processed" });
		expect(duplicate).toEqual({ outcome: "duplicate" });
		expect(polar.retrievals).toBe(1);
		expect(store.events.get("evt_1")).toBe("processed");
		expect(store.projections.get("user-1")).toMatchObject({
			planTier: "creator",
			providerStatus: "active",
		});
	});

	it("uses the external customer id to establish the first customer association", async () => {
		const { billing, store, polar } = service();
		polar.event = {
			...polar.event,
			id: "evt_first",
			type: "subscription.active",
			userId: "user-new",
		};

		await billing.processWebhook("raw", HEADERS);

		expect(store.customers.get("cus_1")).toBe("user-new");
		expect(store.projections.get("user-new")?.planTier).toBe("creator");
	});

	it("never regresses a projection when Polar delivers an older event", async () => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		store.projections.set("user-1", {
			userId: "user-1",
			planTier: "creator",
			providerStatus: "active",
			providerCustomerId: "cus_1",
			providerSubscriptionId: "sub_1",
			providerProductId: "prod_creator_monthly",
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			lastEventId: "evt_new",
			lastEventCreatedAt: new Date("2026-08-30T21:00:00.000Z"),
		});
		polar.event = { ...polar.event, id: "evt_old", createdAt: EVENT_TIME };
		polar.subscription = { ...polar.subscription, status: "canceled" };

		await billing.processWebhook("raw", HEADERS);

		expect(store.projections.get("user-1")?.planTier).toBe("creator");
		expect(store.events.get("evt_old")).toBe("processed");
	});

	it("ignores an event that cannot be associated with a Typelapse user", async () => {
		const { billing, store, polar } = service();

		const result = await billing.processWebhook("raw", HEADERS);

		expect(result).toEqual({ outcome: "ignored" });
		expect(polar.retrievals).toBe(0);
		expect(store.events.get("evt_1")).toBe("ignored");
	});

	it.each([
		"subscription.active",
		"subscription.updated",
		"subscription.canceled",
		"subscription.uncanceled",
		"subscription.revoked",
		"subscription.past_due",
		"order.paid",
	])("refreshes the subscription on %s", async (type) => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		polar.event = { ...polar.event, type };

		await expect(billing.processWebhook("raw", HEADERS)).resolves.toEqual({ outcome: "processed" });

		expect(polar.retrievals).toBe(1);
	});

	it.each([
		"checkout.created",
		"subscription.created",
		"subscription.cycled",
		"customer.state_changed",
		"order.created",
		"brand_new.event",
	])("ignores %s without asking Polar for anything", async (type) => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		polar.event = { ...polar.event, type };

		await expect(billing.processWebhook("raw", HEADERS)).resolves.toEqual({ outcome: "ignored" });

		expect(polar.retrievals).toBe(0);
	});

	it("keeps Creator while a cancellation waits for the period to end, and drops it on revoke", async () => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		polar.subscription = { ...polar.subscription, cancelAtPeriodEnd: true };
		polar.event = { ...polar.event, id: "wh_cancel", type: "subscription.canceled" };

		await billing.processWebhook("raw", { "webhook-id": "wh_cancel" });

		expect(store.projections.get("user-1")).toMatchObject({
			planTier: "creator",
			providerStatus: "active",
			cancelAtPeriodEnd: true,
		});

		polar.subscription = { ...polar.subscription, status: "canceled" };
		polar.event = {
			...polar.event,
			id: "wh_revoke",
			type: "subscription.revoked",
			createdAt: new Date(EVENT_TIME.getTime() + 60_000),
		};
		await billing.processWebhook("raw", { "webhook-id": "wh_revoke" });

		expect(store.projections.get("user-1")).toMatchObject({
			planTier: "free",
			providerStatus: "canceled",
		});
	});

	it("projects past_due as free, with the status kept so the account can be told why", async () => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		polar.subscription = { ...polar.subscription, status: "past_due" };
		polar.event = { ...polar.event, type: "subscription.past_due" };

		await billing.processWebhook("raw", HEADERS);

		expect(store.projections.get("user-1")).toMatchObject({
			planTier: "free",
			providerStatus: "past_due",
		});
		expect(await billing.planFor("user-1")).toMatchObject({
			tier: "free",
			status: "past_due",
			since: EVENT_TIME,
		});
	});

	it("never grants Creator for a product that is not one of the two configured", async () => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		polar.subscription = { ...polar.subscription, productId: "prod_someone_elses" };

		await billing.processWebhook("raw", HEADERS);

		expect(store.projections.get("user-1")?.planTier).toBe("free");
	});

	it("says an account that never subscribed has no billing status", async () => {
		expect(await service().billing.planFor("nobody")).toEqual({
			tier: "free",
			status: "none",
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			since: null,
		});
	});

	it("retries a previously failed event without treating it as a duplicate", async () => {
		const { billing, store, polar } = service();
		store.customers.set("cus_1", "user-1");
		polar.retrieveSubscription = async () => {
			polar.retrievals += 1;
			if (polar.retrievals === 1) {
				throw new Error("Temporary Polar outage");
			}
			return polar.subscription;
		};

		await expect(billing.processWebhook("raw", HEADERS)).rejects.toThrow(
			"Temporary Polar outage",
		);
		expect(store.events.get("evt_1")).toBe("failed");

		await expect(billing.processWebhook("raw", HEADERS)).resolves.toEqual({
			outcome: "processed",
		});
		expect(store.events.get("evt_1")).toBe("processed");
		expect(polar.retrievals).toBe(2);
	});
});
