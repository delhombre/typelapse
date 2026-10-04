import Stripe from "stripe";
import { webhookPayloadFingerprint } from "../db/persistence-values";
import type {
	NormalizedStripeEvent,
	StripeBillingGateway,
	StripeSubscriptionStateName,
} from "./billing-service";
import { InvalidBillingWebhookSignatureError } from "./billing-service";

const TYPELAPSE_USER_ID = "typelapse_user_id";

type StripeEnvironment = Readonly<Record<string, string | undefined>>;

function expandableId(value: string | { readonly id: string } | null | undefined): string | undefined {
	if (typeof value === "string") {
		return value;
	}
	return value?.id;
}

function normalizedIdentity(event: Stripe.Event): Pick<
	NormalizedStripeEvent,
	"customerId" | "subscriptionId" | "userId"
> {
	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;
		return {
			customerId: expandableId(session.customer),
			subscriptionId: expandableId(session.subscription),
			userId: session.client_reference_id ?? session.metadata?.[TYPELAPSE_USER_ID] ?? undefined,
		};
	}
	if (event.type.startsWith("customer.subscription.")) {
		const subscription = event.data.object as Stripe.Subscription;
		return {
			customerId: expandableId(subscription.customer),
			subscriptionId: subscription.id,
			userId: subscription.metadata?.[TYPELAPSE_USER_ID] ?? undefined,
		};
	}
	return {};
}

function subscriptionStatus(value: Stripe.Subscription.Status): StripeSubscriptionStateName {
	switch (value) {
		case "incomplete":
		case "incomplete_expired":
		case "trialing":
		case "active":
		case "past_due":
		case "canceled":
		case "unpaid":
		case "paused":
			return value as StripeSubscriptionStateName;
		default:
			throw new Error("Stripe returned an unsupported subscription status");
	}
}

/** The only module that knows the Stripe SDK shape. */
export function createStripeBillingGateway(input: {
	readonly stripe: Stripe;
	readonly webhookSecret: string;
}): StripeBillingGateway {
	const { stripe, webhookSecret } = input;
	return {
		async createCheckout(checkout) {
			const metadata = { [TYPELAPSE_USER_ID]: checkout.userId };
			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				...(checkout.customerId ? { customer: checkout.customerId } : {}),
				client_reference_id: checkout.userId,
				line_items: [{ price: checkout.priceId, quantity: 1 }],
				metadata,
				subscription_data: { metadata },
				success_url: checkout.successUrl,
				cancel_url: checkout.cancelUrl,
				allow_promotion_codes: true,
			});
			if (!session.url) {
				throw new Error("Stripe Checkout did not return a redirect URL");
			}
			return { id: session.id, url: session.url };
		},

		async createPortal(portal) {
			const session = await stripe.billingPortal.sessions.create({
				customer: portal.customerId,
				return_url: portal.returnUrl,
			});
			return { url: session.url };
		},

		async verifyWebhook(rawBody, signature) {
			let event: Stripe.Event;
			try {
				event = await stripe.webhooks.constructEventAsync(
					rawBody,
					signature,
					webhookSecret,
				);
			} catch {
				throw new InvalidBillingWebhookSignatureError();
			}
			return {
				id: event.id,
				type: event.type,
				createdAt: new Date(event.created * 1000),
				livemode: event.livemode,
				payloadHash: webhookPayloadFingerprint(rawBody),
				...normalizedIdentity(event),
			};
		},

		async retrieveSubscription(subscriptionId) {
			const subscription = await stripe.subscriptions.retrieve(subscriptionId);
			const item = subscription.items.data[0];
			const customerId = expandableId(subscription.customer);
			if (!item || !customerId) {
				throw new Error("Stripe subscription is missing its price or customer");
			}
			return {
				customerId,
				subscriptionId: subscription.id,
				priceId: item.price.id,
				status: subscriptionStatus(subscription.status),
				currentPeriodEnd: new Date(item.current_period_end * 1000),
				cancelAtPeriodEnd: subscription.cancel_at_period_end,
			};
		},

		async retrievePrice(priceId) {
			const price = await stripe.prices.retrieve(priceId);
			const recurringInterval = price.recurring?.interval;
			if (
				!price.active ||
				price.type !== "recurring" ||
				!price.recurring ||
				(recurringInterval !== "month" && recurringInterval !== "year") ||
				price.unit_amount === null ||
				!Number.isSafeInteger(price.unit_amount) ||
				price.unit_amount <= 0
			) {
				throw new Error("Stripe price must be an active monthly or annual recurring price");
			}
			const normalizedInterval: "month" | "year" =
				recurringInterval === "month" ? "month" : "year";
			return {
				id: price.id,
				currency: price.currency,
				unitAmount: price.unit_amount,
				recurringInterval: normalizedInterval,
			};
		},
	};
}

/** Missing hosted billing secrets keeps billing unavailable rather than mocked. */
export function stripeGatewayFromEnv(
	env: StripeEnvironment = process.env,
): StripeBillingGateway | null {
	const secretKey = env.STRIPE_SECRET_KEY;
	const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
	if (!secretKey || !webhookSecret) {
		return null;
	}
	return createStripeBillingGateway({
		stripe: new Stripe(secretKey),
		webhookSecret,
	});
}
