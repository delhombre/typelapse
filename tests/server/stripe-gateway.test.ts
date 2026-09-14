import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
	createStripeBillingGateway,
	stripeGatewayFromEnv,
} from "../../server/billing/stripe-gateway";

function fakeStripe() {
	const calls: {
		checkout?: unknown;
		portal?: unknown;
		webhook?: readonly [string, string, string];
		retrieve?: string;
		price?: string;
	} = {};
	let event: unknown = {
		id: "evt_checkout",
		type: "checkout.session.completed",
		created: 1_788_120_000,
		livemode: false,
		data: {
			object: {
				customer: "cus_1",
				subscription: "sub_1",
				client_reference_id: "user-1",
				metadata: {},
			},
		},
	};
	const client = {
		checkout: {
			sessions: {
				create: async (input: unknown) => {
					calls.checkout = input;
					return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
				},
			},
		},
		billingPortal: {
			sessions: {
				create: async (input: unknown) => {
					calls.portal = input;
					return { url: "https://billing.stripe.test/bps_1" };
				},
			},
		},
		webhooks: {
			constructEventAsync: async (body: string, signature: string, secret: string) => {
				calls.webhook = [body, signature, secret];
				return event;
			},
		},
		subscriptions: {
			retrieve: async (id: string) => {
				calls.retrieve = id;
				return {
					id,
					customer: "cus_1",
					status: "active",
					cancel_at_period_end: true,
					items: {
						data: [
							{
								price: { id: "price_creator_monthly" },
								current_period_end: 1_790_712_000,
							},
						],
					},
				};
			},
		},
		prices: {
			retrieve: async (id: string) => {
				calls.price = id;
				return {
					id,
					active: true,
					currency: "eur",
					unit_amount: 1200,
					type: "recurring",
					recurring: { interval: "month" },
				};
			},
		},
	};
	return {
		calls,
		client: client as unknown as Stripe,
		setEvent(next: unknown) {
			event = next;
		},
	};
}

describe("Stripe billing gateway", () => {
	it("creates a one-price subscription Checkout with server metadata", async () => {
		const fake = fakeStripe();
		const gateway = createStripeBillingGateway({
			stripe: fake.client,
			webhookSecret: "whsec_test",
		});

		await gateway.createCheckout({
			userId: "user-1",
			customerId: "cus_1",
			priceId: "price_creator_monthly",
			successUrl: "https://typelapse.test/app?billing=success",
			cancelUrl: "https://typelapse.test/app?billing=cancelled",
		});

		expect(fake.calls.checkout).toEqual({
			mode: "subscription",
			customer: "cus_1",
			client_reference_id: "user-1",
			line_items: [{ price: "price_creator_monthly", quantity: 1 }],
			metadata: { typelapse_user_id: "user-1" },
			subscription_data: { metadata: { typelapse_user_id: "user-1" } },
			success_url: "https://typelapse.test/app?billing=success",
			cancel_url: "https://typelapse.test/app?billing=cancelled",
			allow_promotion_codes: true,
		});
	});

	it("creates a customer portal only with the supplied server customer", async () => {
		const fake = fakeStripe();
		const gateway = createStripeBillingGateway({
			stripe: fake.client,
			webhookSecret: "whsec_test",
		});

		await gateway.createPortal({
			customerId: "cus_1",
			returnUrl: "https://typelapse.test/app",
		});

		expect(fake.calls.portal).toEqual({
			customer: "cus_1",
			return_url: "https://typelapse.test/app",
		});
	});

	it("verifies the raw webhook and normalizes Checkout identity", async () => {
		const fake = fakeStripe();
		const gateway = createStripeBillingGateway({
			stripe: fake.client,
			webhookSecret: "whsec_test",
		});

		const normalized = await gateway.verifyWebhook("raw-body", "sig_test");

		expect(fake.calls.webhook).toEqual(["raw-body", "sig_test", "whsec_test"]);
		expect(normalized).toMatchObject({
			id: "evt_checkout",
			type: "checkout.session.completed",
			livemode: false,
			customerId: "cus_1",
			subscriptionId: "sub_1",
			userId: "user-1",
		});
		expect(normalized.createdAt).toEqual(new Date(1_788_120_000_000));
		expect(normalized.payloadHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("normalizes subscription metadata and reads period data from its item", async () => {
		const fake = fakeStripe();
		fake.setEvent({
			id: "evt_subscription",
			type: "customer.subscription.updated",
			created: 1_788_120_100,
			livemode: true,
			data: {
				object: {
					id: "sub_1",
					customer: "cus_1",
					metadata: { typelapse_user_id: "user-1" },
				},
			},
		});
		const gateway = createStripeBillingGateway({
			stripe: fake.client,
			webhookSecret: "whsec_test",
		});

		await expect(gateway.verifyWebhook("raw", "sig")).resolves.toMatchObject({
			customerId: "cus_1",
			subscriptionId: "sub_1",
			userId: "user-1",
		});
		await expect(gateway.retrieveSubscription("sub_1")).resolves.toEqual({
			customerId: "cus_1",
			subscriptionId: "sub_1",
			priceId: "price_creator_monthly",
			status: "active",
			currentPeriodEnd: new Date(1_790_712_000_000),
			cancelAtPeriodEnd: true,
		});
		expect(fake.calls.retrieve).toBe("sub_1");
	});

	it("reads only active recurring Stripe prices with integer amounts", async () => {
		const fake = fakeStripe();
		const gateway = createStripeBillingGateway({
			stripe: fake.client,
			webhookSecret: "whsec_test",
		});

		await expect(gateway.retrievePrice("price_creator_monthly")).resolves.toEqual({
			id: "price_creator_monthly",
			currency: "eur",
			unitAmount: 1200,
			recurringInterval: "month",
		});
		expect(fake.calls.price).toBe("price_creator_monthly");
	});

	it("stays unavailable when hosted Stripe secrets are incomplete", () => {
		expect(stripeGatewayFromEnv({})).toBeNull();
		expect(stripeGatewayFromEnv({ STRIPE_SECRET_KEY: "sk_test_only" })).toBeNull();
	});
});
