import {
	createPolar,
	type Environment,
	type Polar,
	webhooks,
} from "@polar-sh/sdk/2026-10";
import { webhookPayloadFingerprint } from "../db/persistence-values";
import {
	type BillingGateway,
	type BillingSubscriptionStatus,
	type BillingWebhookHeaders,
	InvalidBillingWebhookSignatureError,
	type NormalizedBillingEvent,
} from "./billing-service";

type PolarEnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** The slice of the SDK this gateway uses, so a test can hand it any client of that shape. */
type PolarClient = Pick<Polar, "checkouts" | "customerSessions" | "subscriptions" | "products">;

const SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set<BillingSubscriptionStatus>([
	"incomplete",
	"incomplete_expired",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
	"paused",
]);

function subscriptionStatus(value: string): BillingSubscriptionStatus {
	if (!SUBSCRIPTION_STATUSES.has(value)) {
		throw new Error("Polar returned an unsupported subscription status");
	}
	return value as BillingSubscriptionStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function textOf(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Who a delivery is about, read from the payload Polar signed. Our account id
 * comes back as the customer's external id, set when the checkout was created.
 */
function identityOf(type: string, data: unknown): Pick<
	NormalizedBillingEvent,
	"customerId" | "subscriptionId" | "userId"
> {
	if (!isRecord(data)) {
		return {};
	}
	const customer = isRecord(data.customer) ? data.customer : {};
	const userId = textOf(customer.external_id);
	const customerId = textOf(data.customer_id) ?? textOf(customer.id);
	if (type.startsWith("subscription.")) {
		return { customerId, subscriptionId: textOf(data.id), userId };
	}
	if (type === "order.paid") {
		return { customerId, subscriptionId: textOf(data.subscription_id), userId };
	}
	return {};
}

function eventTime(timestamp: unknown, headers: BillingWebhookHeaders): Date {
	const fromBody = typeof timestamp === "string" ? new Date(timestamp) : null;
	if (fromBody && !Number.isNaN(fromBody.getTime())) {
		return fromBody;
	}
	return new Date(Number(headers["webhook-timestamp"]) * 1000);
}

/** The only module that knows the Polar SDK shape. */
export function createPolarBillingGateway(input: {
	readonly polar: PolarClient;
	readonly webhookSecret: string;
	readonly environment: Environment;
}): BillingGateway {
	const { polar, webhookSecret, environment } = input;
	return {
		async createCheckout(checkout) {
			const session = await polar.checkouts.create({
				products: [checkout.productId],
				external_customer_id: checkout.userId,
				success_url: checkout.successUrl,
				return_url: checkout.returnUrl,
			});
			return { id: session.id, url: session.url };
		},

		async createPortal(portal) {
			const session = await polar.customerSessions.create({
				external_customer_id: portal.userId,
				return_url: portal.returnUrl,
			});
			return { url: session.customer_portal_url };
		},

		async verifyWebhook(rawBody, headers) {
			const signed: Record<string, string> = {};
			for (const name of ["webhook-id", "webhook-timestamp", "webhook-signature"]) {
				const value = headers[name];
				if (!value) {
					throw new InvalidBillingWebhookSignatureError();
				}
				signed[name] = value;
			}
			const id = signed["webhook-id"] as string;
			const base = {
				id,
				livemode: environment === "production",
				payloadHash: webhookPayloadFingerprint(rawBody),
			};
			try {
				const event = await webhooks.validateEvent(rawBody, signed, webhookSecret);
				return {
					...base,
					type: event.type,
					createdAt: eventTime(event.timestamp, headers),
					...identityOf(event.type, event.data),
				};
			} catch (error) {
				if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
					// Signed by Polar, so trusted; a type this SDK has not met yet moves no plan.
					const parsed: unknown = JSON.parse(rawBody);
					return {
						...base,
						type: error.eventType ?? "unknown",
						createdAt: eventTime(isRecord(parsed) ? parsed.timestamp : undefined, headers),
					};
				}
				throw new InvalidBillingWebhookSignatureError();
			}
		},

		async retrieveSubscription(subscriptionId) {
			const subscription = await polar.subscriptions.get(subscriptionId);
			return {
				customerId: subscription.customer_id,
				subscriptionId: subscription.id,
				productId: subscription.product_id,
				status: subscriptionStatus(subscription.status),
				currentPeriodEnd: new Date(subscription.current_period_end),
				cancelAtPeriodEnd: subscription.cancel_at_period_end,
			};
		},

		async retrieveProduct(productId) {
			const product = await polar.products.get(productId);
			const interval = product.recurring_interval;
			// Polar prices a product in several currencies; the catalog quotes USD, the
			// currency of record (decision D3), and falls back to the first fixed price.
			const fixed = product.prices.filter(
				(price) => price.amount_type === "fixed" && !price.is_archived,
			);
			const price =
				fixed.find((candidate) => candidate.price_currency === "usd") ?? fixed[0];
			if (
				product.is_archived ||
				!product.is_recurring ||
				(interval !== "month" && interval !== "year") ||
				(product.recurring_interval_count ?? 1) !== 1 ||
				!price ||
				price.amount_type !== "fixed"
			) {
				throw new Error("Polar product must be an active monthly or annual recurring product");
			}
			return {
				id: product.id,
				currency: price.price_currency,
				unitAmount: price.price_amount,
				recurringInterval: interval,
			};
		},
	};
}

/**
 * `POLAR_API_URL` points the SDK at a self-hosted Polar or at the double the
 * hosted journeys run against. It is honoured only with `POLAR_ENVIRONMENT=sandbox`:
 * a production deployment cannot be redirected, by a stray variable, away from
 * the real merchant of record.
 */
export function polarApiUrlFromEnv(env: PolarEnvironmentVariables): string | undefined {
	return polarEnvironmentFromEnv(env) === "sandbox" && env.POLAR_API_URL?.trim()
		? env.POLAR_API_URL.trim()
		: undefined;
}

/** `POLAR_ENVIRONMENT` is `production` unless it says `sandbox`; anything else is a typo and null. */
export function polarEnvironmentFromEnv(env: PolarEnvironmentVariables): Environment | null {
	const value = env.POLAR_ENVIRONMENT?.trim().toLowerCase();
	if (!value) {
		return "production";
	}
	return value === "sandbox" || value === "production" ? value : null;
}

/** Missing hosted billing secrets keeps billing unavailable rather than mocked. */
export function polarGatewayFromEnv(
	env: PolarEnvironmentVariables = process.env,
): BillingGateway | null {
	const accessToken = env.POLAR_ACCESS_TOKEN;
	const webhookSecret = env.POLAR_WEBHOOK_SECRET;
	const environment = polarEnvironmentFromEnv(env);
	if (!accessToken || !webhookSecret || !environment) {
		return null;
	}
	return createPolarBillingGateway({
		polar: createPolar({
			accessToken,
			environment,
			...(polarApiUrlFromEnv(env) ? { baseUrl: polarApiUrlFromEnv(env) as string } : {}),
		}),
		webhookSecret,
		environment,
	});
}
