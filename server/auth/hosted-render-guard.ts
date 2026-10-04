import type { Context, MiddlewareHandler } from "hono";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
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
 * The request's credential, as an opaque string: the cookie header.
 *
 * Cookies only, on purpose. better-auth authenticates by signed cookie unless
 * its bearer plugin is enabled, and it is not. An earlier version also accepted
 * `Authorization: Bearer`, which was worse than useless: a request carrying
 * both a valid cookie and a bearer header had its cookie discarded in favour of
 * a token nothing could verify, turning a valid session into a 401. API tokens
 * are a real need for the GitHub App later, and the honest way to add them is
 * the bearer plugin plus a credential the adapter can tell apart, not a string
 * that silently means two things.
 */
const credentialFrom = (c: Context): string | null => {
	return c.req.header("cookie") ?? null;
};

/**
 * Identify the caller of a hosted route and resolve their plan on the server.
 *
 * Authentication only: entitlement is decided per action, because a free
 * account may still read its jobs and download outputs within the grace period
 * while it may not start a render. 401 says we do not know who you are; the
 * routes answer 402 when we do and the plan does not cover the action.
 */
export const requireHostedAccount = (deps: HostedRenderDeps): MiddlewareHandler => {
	return async (c, next) => {
		const accountId = await authenticateAccount({
			credential: credentialFrom(c),
			auth: deps.auth,
			now: new Date(),
		});
		if (!accountId) {
			return c.json({ error: "Sign in to render on Typelapse's servers" }, 401);
		}
		c.set("accountId", accountId);
		c.set("plan", await deps.subscriptions.planFor(accountId));
		await next();
	};
};
