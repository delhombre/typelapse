import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApiKeyService } from "../../server/auth/api-keys";
import { createApiKeysRoute } from "../../server/routes/api-keys";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const signedIn = (accountId: string): AuthPort => ({
	verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
});
const signedOut: AuthPort = { verify: async () => null };

function harness(auth: AuthPort = signedIn("owner-1")) {
	const repository = new MemoryApiKeyRepository();
	const service = createApiKeyService({ repository });
	const app = new Hono().route(
		"/api/keys",
		createApiKeysRoute({ auth, keys: service, now: () => NOW }),
	);
	return { app, service, repository };
}

const asAccount = { cookie: "session=valid" };

function create(body: unknown, headers: Record<string, string> = asAccount) {
	return new Request("http://localhost/api/keys", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("key management belongs to the signed-in account alone", () => {
	it("refuses a request with no session, and a key does not stand in for one", async () => {
		const { app, service } = harness(signedOut);
		const made = await service.create({
			ownerId: "owner-1",
			name: "ci",
			expiresInDays: null,
			now: NOW,
		});
		if (made.outcome !== "created") {
			throw new Error("expected a key");
		}
		const withKey = { authorization: `Bearer ${made.key}` };

		const responses = await Promise.all([
			app.request("http://localhost/api/keys", { headers: withKey }),
			app.request(create({ name: "another" }, withKey)),
			app.request(`http://localhost/api/keys/${made.created.prefix}`, {
				method: "DELETE",
				headers: withKey,
			}),
			app.request("http://localhost/api/keys"),
		]);

		expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
		expect(await responses[0]?.json()).toEqual({ error: "Sign in to manage API keys" });
		expect(await service.list("owner-1")).toHaveLength(1);
	});
});

describe("creating a key", () => {
	it("returns the key once, in no-store, beside its summary", async () => {
		const { app } = harness();

		const response = await app.request(create({ name: "  GitHub Action  " }));
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body.key).toMatch(/^tlk_[0-9a-f]{8}_[0-9a-f]{64}$/);
		expect(body.created).toEqual({
			prefix: body.key.slice(0, 12),
			name: "GitHub Action",
			createdAt: NOW.toISOString(),
			expiresAt: null,
			lastUsedAt: null,
		});
	});

	it("counts a chosen number of days from the moment of the request", async () => {
		const { app } = harness();

		const response = await app.request(create({ name: "ci", expiresInDays: 30 }));
		const body = await response.json();

		expect(body.created.expiresAt).toBe(new Date(NOW.getTime() + 30 * DAY_MS).toISOString());
	});

	it.each([
		["no name", {}],
		["a blank name", { name: "   " }],
		["a name of 61 characters", { name: "a".repeat(61) }],
		["a name that is not text", { name: 7 }],
		["a name with a control character", { name: "ci\u0007" }],
	])("refuses %s and says how long a name may be", async (_label, body) => {
		const { app, service } = harness();

		const response = await app.request(create(body));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Name the key in 1 to 60 characters" });
		expect(await service.list("owner-1")).toEqual([]);
	});

	it.each([
		["zero days", 0],
		["a year and a day", 366],
		["half a day", 0.5],
		["days as text", "30"],
	])("refuses %s as a lifetime", async (_label, expiresInDays) => {
		const { app } = harness();

		const response = await app.request(create({ name: "ci", expiresInDays }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Choose a lifetime of 1 to 365 days, or none",
		});
	});

	it("refuses a body that is not JSON, so a cross-site form cannot make a key", async () => {
		const { app, service } = harness();

		const form = await app.request(
			new Request("http://localhost/api/keys", {
				method: "POST",
				headers: { "content-type": "text/plain", ...asAccount },
				body: JSON.stringify({ name: "ci" }),
			}),
		);
		const broken = await app.request(create("{not json"));

		expect(form.status).toBe(415);
		expect(broken.status).toBe(400);
		expect(await service.list("owner-1")).toEqual([]);
	});

	it("refuses a body past a few kilobytes", async () => {
		const { app } = harness();

		const response = await app.request(create({ name: "ci", padding: "x".repeat(8 * 1024) }));

		expect(response.status).toBe(413);
	});

	it("says so at the eleventh key", async () => {
		const { app } = harness();
		for (let index = 0; index < 10; index += 1) {
			expect((await app.request(create({ name: `key ${index}` }))).status).toBe(201);
		}

		const response = await app.request(create({ name: "one too many" }));

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "You already have 10 API keys, so revoke one to create another",
			code: "key-limit",
			limit: 10,
		});
	});
});

describe("listing and revoking", () => {
	it("lists the account's keys without any secret, newest first, in no-store", async () => {
		const { app } = harness();
		const first = await (await app.request(create({ name: "first" }))).json();
		await app.request(create({ name: "second" }));

		const response = await app.request("http://localhost/api/keys", { headers: asAccount });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body.keys).toHaveLength(2);
		expect(Object.keys(body.keys[0]).sort()).toEqual([
			"createdAt",
			"expiresAt",
			"lastUsedAt",
			"name",
			"prefix",
		]);
		expect(JSON.stringify(body)).not.toContain(first.key.slice(13));
	});

	it("revokes the account's own key, and says 404 for anyone else's or an unknown one", async () => {
		const mine = harness(signedIn("owner-1"));
		const made = await (await mine.app.request(create({ name: "mine" }))).json();
		const stranger = new Hono().route(
			"/api/keys",
			createApiKeysRoute({ auth: signedIn("owner-2"), keys: mine.service, now: () => NOW }),
		);
		const revoke = (app: Hono, prefix: string) =>
			app.request(`http://localhost/api/keys/${prefix}`, { method: "DELETE", headers: asAccount });

		const byStranger = await revoke(stranger, made.created.prefix);
		const unknown = await revoke(mine.app, "tlk_00000000");
		const byOwner = await revoke(mine.app, made.created.prefix);
		const again = await revoke(mine.app, made.created.prefix);

		expect(byStranger.status).toBe(404);
		expect(await byStranger.json()).toEqual({ error: "API key not found" });
		expect(unknown.status).toBe(404);
		expect(byOwner.status).toBe(204);
		expect(again.status).toBe(404);
		expect(await mine.service.list("owner-1")).toEqual([]);
	});
});
