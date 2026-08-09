import type { Context, MiddlewareHandler } from "hono";
import { authorizeHostedRender } from "../../src/application/auth/authorize-hosted-render";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import { Plan } from "../../src/domain/value-objects/plan";

export interface HostedRenderDeps {
	readonly auth: AuthPort;
	readonly subscriptions: SubscriptionPort;
}

/**
 * Until an auth provider is wired, no credential proves anything.
 *
 * Refusing everyone is the honest default: the alternative is a server that
 * grants hosted rendering to whoever asks, which is exactly the bug this
 * middleware exists to remove.
 */
const unconfiguredAuth: AuthPort = {
	verify: async () => null,
};

/** No billing yet, so every account sits on the free plan. */
const noSubscriptions: SubscriptionPort = {
	planFor: async () => Plan.free(),
};

export const defaultHostedRenderDeps: HostedRenderDeps = {
	auth: unconfiguredAuth,
	subscriptions: noSubscriptions,
};

/**
 * The request's credential, as an opaque string.
 *
 * Whether it is a bearer token or a cookie jar is the adapter's business; this
 * only decides which header carries it.
 */
const credentialFrom = (c: Context): string | null => {
	const authorization = c.req.header("authorization");

	if (authorization?.startsWith("Bearer ")) {
		return authorization.slice("Bearer ".length);
	}

	return c.req.header("cookie") ?? null;
};

/**
 * Gate a route on hosted-render entitlement.
 *
 * The two refusals are kept distinct all the way to the status code: 401 says
 * we do not know who you are, 402 says we do and your plan does not cover this.
 * Collapsing them would tell a paying user to sign in again, and an anonymous
 * one to upgrade an account they do not have.
 */
export const requireHostedRenderEntitlement = (
	deps: HostedRenderDeps,
): MiddlewareHandler => {
	return async (c, next) => {
		const decision = await authorizeHostedRender({
			credential: credentialFrom(c),
			auth: deps.auth,
			subscriptions: deps.subscriptions,
			now: new Date(),
		});

		if (decision.outcome === "unauthenticated") {
			return c.json({ error: "Sign in to render on Typelapse's servers" }, 401);
		}

		if (decision.outcome === "forbidden") {
			return c.json(
				{
					error: "Hosted rendering is not included in your plan",
					plan: decision.plan.tier,
				},
				402,
			);
		}

		c.set("accountId", decision.accountId);
		c.set("plan", decision.plan);

		await next();
	};
};
