import type { Context, MiddlewareHandler } from "hono";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import { Plan } from "../../src/domain/value-objects/plan";
import type { ApiKeyAuthentication, ApiKeyAuthenticator } from "./api-keys";

export interface HostedRenderDeps {
	readonly auth: AuthPort;
	readonly subscriptions: SubscriptionPort;
	/** Without it, a key proves nothing and every request is judged by its cookie. */
	readonly apiKeys?: ApiKeyAuthenticator;
	/** The clock a session's and a key's expiry are read against. */
	readonly now?: () => Date;
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
 * The session credential, as an opaque string: the cookie header, and only the
 * cookie. better-auth authenticates by signed cookie unless its bearer plugin
 * is enabled, and it is not, so `AuthPort.verify` never sees a bearer token.
 */
const credentialFrom = (c: Context): string | null => {
	return c.req.header("cookie") ?? null;
};

/**
 * The API key, when the request carries one: `Authorization: Bearer <key>`,
 * and nowhere else (never a query string, which logs and Referer headers keep).
 *
 * A key is a second credential, told apart from a session by what it is and by
 * who verifies it. An earlier version took any bearer string as the session
 * credential, so a request with a valid cookie and a bearer header lost its
 * cookie to a token nothing could verify and became a 401. Here the cookie is
 * judged first and the key only when the cookie proves nothing.
 */
const bearerFrom = (c: Context): string | null => {
	return /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? null;
};

const SIGN_IN_REFUSAL = "Sign in to render on Typelapse's servers";
/** One sentence for every key that does not work, so it never says which kind. */
const KEY_REFUSAL = "This API key is not valid: it may be unknown, revoked or expired";
const CHALLENGE = 'Bearer realm="Typelapse"';
const KEY_CHALLENGE = `${CHALLENGE}, error="invalid_token"`;
const KEY_REFUSED: ApiKeyAuthentication = { outcome: "refused" };

const tooManyRequests = (seconds: number) =>
	`Too many requests with this API key, try again in ${seconds} seconds`;

/**
 * Identify the caller of a hosted route and resolve their plan on the server.
 * The one guard where an API key stands in for the session: account, billing,
 * projects, assets and key management read the cookie alone.
 *
 * Authentication only: entitlement is decided per action, because a free
 * account may still read its jobs and download outputs within the grace period
 * while it may not start a render. 401 says we do not know who you are; the
 * routes answer 402 when we do and the plan does not cover the action. A key
 * past its ceiling is a 429 with the seconds to wait.
 */
export const requireHostedAccount = (deps: HostedRenderDeps): MiddlewareHandler => {
	const now = deps.now ?? (() => new Date());
	return async (c, next) => {
		const at = now();
		let accountId = await authenticateAccount({
			credential: credentialFrom(c),
			auth: deps.auth,
			now: at,
		});
		const key = accountId ? null : bearerFrom(c);
		if (key !== null) {
			const attempt = (await deps.apiKeys?.authenticate(key, at)) ?? KEY_REFUSED;
			if (attempt.outcome === "rate-limited") {
				c.header("Retry-After", String(attempt.retryAfterSeconds));
				return c.json({ error: tooManyRequests(attempt.retryAfterSeconds) }, 429);
			}
			if (attempt.outcome === "authenticated") {
				accountId = attempt.accountId;
			}
		}
		if (!accountId) {
			c.header("WWW-Authenticate", key === null ? CHALLENGE : KEY_CHALLENGE);
			return c.json({ error: key === null ? SIGN_IN_REFUSAL : KEY_REFUSAL }, 401);
		}
		c.set("accountId", accountId);
		c.set("plan", await deps.subscriptions.planFor(accountId));
		await next();
	};
};
