import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
import { billingNotice } from "../../src/application/billing/billing-notice";
import {
	type AccountUsagePort,
	planAllowance,
	renderPeriodStart,
} from "../../src/application/billing/plan-allowance";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { BillingCadence } from "../../src/domain/ports/billing.port";
import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import {
	AlreadySubscribedError,
	type BillingService,
	InvalidBillingWebhookSignatureError,
} from "../billing/billing-service";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
/** What Polar signs a delivery with (the Standard Webhooks headers). */
const WEBHOOK_HEADERS = ["webhook-id", "webhook-timestamp", "webhook-signature"] as const;

interface BillingRouteEnv {
	Variables: {
		accountId: string;
	};
}

export interface BillingRouteDeps {
	readonly auth: AuthPort;
	readonly billing: BillingService | null;
	/**
	 * The allowance needs only the account's plan and its usage, not the payment
	 * provider: a free account has ceilings whether or not checkout is configured.
	 */
	readonly subscriptions?: SubscriptionPort;
	readonly usage?: AccountUsagePort;
	readonly now?: () => Date;
}

/** Raw signed webhooks plus account-scoped checkout, plan and portal actions. */
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
			maxSize: MAX_WEBHOOK_BYTES,
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
		return c.json({ allowance: planAllowance(plan, current, now()) });
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
		if (!plan) {
			return c.json({ plan });
		}
		return c.json({ plan: { ...plan, notice: billingNotice({ ...plan, now: now() }) } });
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
		} catch (error) {
			if (error instanceof AlreadySubscribedError) {
				return c.json(
					{ error: "You already have Creator; change or cancel it in Manage billing." },
					409,
				);
			}
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
		const headers = Object.fromEntries(
			WEBHOOK_HEADERS.map((name) => [name, c.req.header(name)] as const),
		);
		if (WEBHOOK_HEADERS.some((name) => !headers[name])) {
			return c.json({ error: "Missing webhook signature" }, 400);
		}
		const rawBody = await c.req.text();
		try {
			const result = await billing.processWebhook(rawBody, headers);
			return c.json({ received: true, outcome: result.outcome });
		} catch (error) {
			if (error instanceof InvalidBillingWebhookSignatureError) {
				return c.json({ error: "Invalid webhook signature" }, 400);
			}
			return c.json({ error: "Billing webhook is temporarily unavailable" }, 503);
		}
	});

	return route;
}
