import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
import {
	type AccountUsagePort,
	allowanceSentence,
	hostedTierName,
	renderPeriodStart,
} from "../../src/application/billing/plan-allowance";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { BillingCadence } from "../../src/domain/ports/billing.port";
import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import {
	type BillingService,
	InvalidBillingWebhookSignatureError,
} from "../billing/billing-service";

const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024;

interface BillingRouteEnv {
	Variables: {
		accountId: string;
	};
}

export interface BillingRouteDeps {
	readonly auth: AuthPort;
	readonly billing: BillingService | null;
	/**
	 * The allowance needs only the account's plan and its usage, not Stripe: a
	 * free account has ceilings whether or not checkout is configured.
	 */
	readonly subscriptions?: SubscriptionPort;
	readonly usage?: AccountUsagePort;
	readonly now?: () => Date;
}

/** Raw signed webhooks plus account-scoped Checkout, plan and Portal actions. */
export function createBillingRoute({
	auth,
	billing,
	subscriptions,
	usage,
	now = () => new Date(),
}: BillingRouteDeps): Hono<BillingRouteEnv> {
	const route = new Hono<BillingRouteEnv>();

	const requireAccount: MiddlewareHandler<BillingRouteEnv> = async (c, next) => {
		if (!billing) {
			return c.json({ error: "Hosted billing is not configured" }, 503);
		}
		const accountId = await authenticateAccount({
			credential: c.req.header("cookie") ?? null,
			auth,
			now: now(),
		});
		if (!accountId) {
			return c.json({ error: "Sign in to manage billing" }, 401);
		}
		c.set("accountId", accountId);
		await next();
	};

	route.use("/plan", requireAccount);
	route.use("/checkout", requireAccount);
	route.use("/portal", requireAccount);
	route.use(
		"/webhook",
		bodyLimit({
			maxSize: MAX_STRIPE_WEBHOOK_BYTES,
			onError: (c) => c.json({ error: "Billing webhook is too large" }, 413),
		}),
	);

	route.get("/allowance", async (c) => {
		if (!subscriptions || !usage) {
			return c.json({ error: "Hosted allowance is not configured" }, 503);
		}
		const accountId = await authenticateAccount({
			credential: c.req.header("cookie") ?? null,
			auth,
			now: now(),
		});
		if (!accountId) {
			return c.json({ error: "Sign in to see your allowance" }, 401);
		}
		const [plan, current] = await Promise.all([
			subscriptions.planFor(accountId),
			usage.usageFor(accountId, renderPeriodStart(now())),
		]);
		return c.json({
			allowance: {
				plan: hostedTierName(plan),
				sentence: allowanceSentence(plan, current),
				limits: {
					cloudProjects: plan.limitFor("cloudProjects"),
					mediaBytes: plan.limitFor("mediaBytes"),
					hostedRenderTime: plan.limitFor("hostedRenderTime"),
					concurrentRenders: plan.limitFor("concurrentRenders"),
				},
				usage: current,
			},
		});
	});

	route.get("/catalog", async (c) => {
		if (!billing) {
			return c.json({ error: "Hosted billing is not configured" }, 503);
		}
		try {
			return c.json(await billing.catalog());
		} catch {
			return c.json({ error: "Pricing is temporarily unavailable" }, 503);
		}
	});

	route.get("/plan", async (c) => {
		const plan = await billing?.planFor(c.get("accountId"));
		return c.json({ plan });
	});

	route.post("/checkout", async (c) => {
		const payload = await c.req.json().catch(() => null);
		const cadence =
			typeof payload === "object" && payload !== null && "cadence" in payload
				? (payload as { cadence?: unknown }).cadence
				: undefined;
		if (cadence !== "monthly" && cadence !== "annual") {
			return c.json({ error: "Choose monthly or annual billing" }, 400);
		}
		try {
			const checkout = await billing?.startCheckout(
				c.get("accountId"),
				cadence satisfies BillingCadence,
			);
			if (!checkout) {
				return c.json({ error: "Hosted billing is not configured" }, 503);
			}
			return c.json({ url: checkout.url, sessionId: checkout.id });
		} catch {
			return c.json({ error: "Checkout is temporarily unavailable" }, 503);
		}
	});

	route.post("/portal", async (c) => {
		try {
			const portal = await billing?.openPortal(c.get("accountId"));
			if (!portal) {
				return c.json({ error: "Hosted billing is not configured" }, 503);
			}
			return c.json({ url: portal.url });
		} catch {
			return c.json({ error: "Billing portal is temporarily unavailable" }, 503);
		}
	});

	route.post("/webhook", async (c) => {
		if (!billing) {
			return c.json({ error: "Hosted billing is not configured" }, 503);
		}
		const signature = c.req.header("stripe-signature");
		if (!signature) {
			return c.json({ error: "Missing Stripe signature" }, 400);
		}
		const rawBody = await c.req.text();
		try {
			const result = await billing.processWebhook(rawBody, signature);
			return c.json({ received: true, outcome: result.outcome });
		} catch (error) {
			if (error instanceof InvalidBillingWebhookSignatureError) {
				return c.json({ error: "Invalid Stripe signature" }, 400);
			}
			return c.json({ error: "Billing webhook is temporarily unavailable" }, 503);
		}
	});

	return route;
}
