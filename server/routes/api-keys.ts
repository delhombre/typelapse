import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	API_KEY_NAME_MAX,
	normalizeApiKeyName,
	parseExpiresInDays,
} from "../../src/application/auth/api-key-rules";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { ApiKeyService } from "../auth/api-keys";

const MAX_KEY_REQUEST_BYTES = 4 * 1024;

interface ApiKeysRouteEnv {
	Variables: {
		accountId: string;
	};
}

export interface ApiKeysRouteDeps {
	readonly auth: AuthPort;
	readonly keys: ApiKeyService;
	readonly now?: () => Date;
}

/**
 * Create, list and revoke the signed-in account's API keys.
 *
 * The session cookie is the only credential here, never a key: a leaked key
 * must not be able to mint its replacement or hide itself by revoking its
 * siblings. Every answer is `no-store`: the create response holds the one copy
 * of a secret, and a cache that kept it would be a second place to read it.
 */
export function createApiKeysRoute({
	auth,
	keys,
	now = () => new Date(),
}: ApiKeysRouteDeps): Hono<ApiKeysRouteEnv> {
	const route = new Hono<ApiKeysRouteEnv>();

	route.use("*", async (c, next) => {
		c.header("Cache-Control", "no-store");
		const accountId = await authenticateAccount({
			credential: c.req.header("cookie") ?? null,
			auth,
			now: now(),
		});
		if (!accountId) {
			return c.json({ error: "Sign in to manage API keys" }, 401);
		}
		c.set("accountId", accountId);
		await next();
	});
	route.use(
		"*",
		bodyLimit({
			maxSize: MAX_KEY_REQUEST_BYTES,
			onError: (c) => c.json({ error: "API key request is too large" }, 413),
		}),
	);

	route.get("/", async (c) => c.json({ keys: await keys.list(c.get("accountId")) }));

	route.post("/", async (c) => {
		// A cross-site form can only send text, so asking for JSON keeps it out
		// without a token of our own; the cookie is SameSite already.
		if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
			return c.json({ error: "Send the key's name as JSON" }, 415);
		}
		const body: unknown = await c.req.json().catch(() => null);
		const input =
			typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
		const name = normalizeApiKeyName(input.name);
		if (name === null) {
			return c.json({ error: `Name the key in 1 to ${API_KEY_NAME_MAX} characters` }, 400);
		}
		const lifetime = parseExpiresInDays(input.expiresInDays);
		if (lifetime === null) {
			return c.json({ error: "Choose a lifetime of 1 to 365 days, or none" }, 400);
		}
		const result = await keys.create({
			ownerId: c.get("accountId"),
			name,
			expiresInDays: lifetime.days,
			now: now(),
		});
		if (result.outcome === "limit-reached") {
			return c.json(
				{
					error: `You already have ${result.limit} API keys, so revoke one to create another`,
					code: "key-limit",
					limit: result.limit,
				},
				409,
			);
		}
		return c.json({ created: result.created, key: result.key }, 201);
	});

	route.delete("/:prefix", async (c) => {
		// Someone else's key and an unknown one are the same 404: no key is
		// confirmed to exist for an account that does not own it.
		if (!(await keys.revoke(c.get("accountId"), c.req.param("prefix")))) {
			return c.json({ error: "API key not found" }, 404);
		}
		return c.body(null, 204);
	});

	return route;
}
