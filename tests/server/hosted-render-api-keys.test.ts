import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type ApiKeyAuthenticator, createApiKeyService } from "../../server/auth/api-keys";
import { createCloudRoute } from "../../server/routes/cloud";
import type { HostedRenderJobService } from "../../src/application/render/hosted-render-job";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const signedOut: AuthPort = { verify: async () => null };
const cookieOf = (accountId: string): AuthPort => ({
	verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
});

function renderJobs(submitted: string[]): HostedRenderJobService {
	const job = {
		id: "job_1",
		projectId: "project-1",
		revision: 4,
		status: "queued" as const,
		createdAt: NOW,
		completedAt: null,
	};
	return {
		submit: async (input) => {
			submitted.push(input.ownerId);
			return { outcome: "accepted", job };
		},
		status: async (ownerId) => {
			submitted.push(ownerId);
			return job;
		},
	};
}

function harness(
	options: {
		auth?: AuthPort;
		now?: () => Date;
		apiKeys?: ApiKeyAuthenticator | null;
	} = {},
) {
	const repository = new MemoryApiKeyRepository();
	const service = createApiKeyService({ repository });
	const consulted: string[] = [];
	const watched: ApiKeyAuthenticator = {
		authenticate: (credential, now) => {
			consulted.push(credential);
			return service.authenticate(credential, now);
		},
	};
	const seen: string[] = [];
	const apiKeys = options.apiKeys === undefined ? watched : (options.apiKeys ?? undefined);
	const app = new Hono().route(
		"/api/cloud",
		createCloudRoute({
			auth: options.auth ?? signedOut,
			subscriptions: { planFor: async () => Plan.pro() },
			renderJobs: renderJobs(seen),
			...(apiKeys ? { apiKeys } : {}),
			now: options.now ?? (() => NOW),
		}),
	);
	return { app, service, repository, consulted, seen };
}

function renderRequest(headers: Record<string, string>) {
	return new Request("http://localhost/api/cloud/render", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({
			projectId: "project-1",
			revision: 4,
			renderOptions: { format: "mp4", width: 1920, height: 1080, fps: 60, includeAudio: true },
		}),
	});
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

async function keyFor(
	service: ReturnType<typeof harness>["service"],
	ownerId: string,
	expiresInDays: number | null = null,
) {
	const result = await service.create({ ownerId, name: "ci", expiresInDays, now: NOW });
	if (result.outcome !== "created") {
		throw new Error("expected a key");
	}
	return result;
}

describe("a key in place of the session cookie", () => {
	it("starts a render for the account that owns the key", async () => {
		const { app, service, seen } = harness();
		const { key } = await keyFor(service, "key-owner");

		const response = await app.request(renderRequest(bearer(key)));

		expect(response.status).toBe(202);
		expect(seen).toEqual(["key-owner"]);
	});

	it("reads a job's status with the key too", async () => {
		const { app, service, seen } = harness();
		const { key } = await keyFor(service, "key-owner");

		const response = await app.request("http://localhost/api/cloud/jobs/job_1", {
			headers: bearer(key),
		});

		expect(response.status).toBe(200);
		expect(seen).toEqual(["key-owner"]);
	});

	it("still lets the plan decide: the key authenticates, it does not entitle", async () => {
		const repository = new MemoryApiKeyRepository();
		const service = createApiKeyService({ repository });
		const { key } = await keyFor(service, "free-owner");
		const app = new Hono().route(
			"/api/cloud",
			createCloudRoute({
				auth: signedOut,
				subscriptions: { planFor: async () => Plan.free() },
				apiKeys: service,
				now: () => NOW,
			}),
		);

		const response = await app.request(renderRequest(bearer(key)));

		expect(response.status).toBe(402);
	});

	it("is authenticated by the cookie when a valid cookie and a key arrive together", async () => {
		const { app, service, consulted, seen } = harness({ auth: cookieOf("cookie-owner") });
		const { key } = await keyFor(service, "key-owner");

		const response = await app.request(renderRequest({ cookie: "session=valid", ...bearer(key) }));

		expect(response.status).toBe(202);
		expect(seen).toEqual(["cookie-owner"]);
		expect(consulted).toEqual([]);
	});

	it("falls back to the key when the cookie proves nothing", async () => {
		const { app, service, consulted, seen } = harness({ auth: signedOut });
		const { key } = await keyFor(service, "key-owner");

		const response = await app.request(renderRequest({ cookie: "session=stale", ...bearer(key) }));

		expect(response.status).toBe(202);
		expect(seen).toEqual(["key-owner"]);
		expect(consulted).toEqual([key]);
	});

	it("takes the key's expiry from the clock the route is given", async () => {
		const clock = { at: NOW };
		const { app, service } = harness({ now: () => clock.at });
		const { key, created } = await keyFor(service, "key-owner", 1);
		const expiresAt = created.expiresAt as Date;

		clock.at = new Date(expiresAt.getTime() - 1);
		const before = await app.request(renderRequest(bearer(key)));
		clock.at = expiresAt;
		const at = await app.request(renderRequest(bearer(key)));

		expect(before.status).toBe(202);
		expect(at.status).toBe(401);
	});
});

describe("a key that does not work", () => {
	it("gets the same 401 whether it is unknown, mistyped, revoked or expired", async () => {
		const clock = { at: NOW };
		const { app, service } = harness({ now: () => clock.at });
		const revoked = await keyFor(service, "key-owner");
		const expiring = await keyFor(service, "key-owner", 1);
		const live = await keyFor(service, "key-owner");
		await service.revoke("key-owner", revoked.created.prefix);
		clock.at = new Date(NOW.getTime() + 2 * DAY_MS);

		const attempts = [
			`tlk_00000000_${"0".repeat(64)}`,
			`${live.created.prefix}_${"0".repeat(64)}`,
			"tlk_not_a_key",
			revoked.key,
			expiring.key,
		];
		const responses = await Promise.all(
			attempts.map((key) => app.request(renderRequest(bearer(key)))),
		);
		const answers = await Promise.all(
			responses.map(async (response) => ({
				status: response.status,
				body: await response.json(),
				challenge: response.headers.get("www-authenticate"),
			})),
		);

		for (const answer of answers) {
			expect(answer).toEqual(answers[0]);
		}
		expect(answers[0]).toEqual({
			status: 401,
			body: { error: "This API key is not valid: it may be unknown, revoked or expired" },
			challenge: 'Bearer realm="Typelapse", error="invalid_token"',
		});
	});

	it("keeps the sign-in sentence for a caller that sent no credential at all", async () => {
		const { app } = harness();

		const response = await app.request(renderRequest({}));

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Sign in to render on Typelapse's servers",
		});
		expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Typelapse"');
	});

	it("is not looked for in a header or a place that is not a bearer credential", async () => {
		const { app, service, consulted } = harness();
		const { key } = await keyFor(service, "key-owner");

		const basic = await app.request(renderRequest({ authorization: `Basic ${key}` }));
		const custom = await app.request(renderRequest({ "x-api-key": key }));
		const query = await app.request(
			new Request(`http://localhost/api/cloud/jobs/job_1?api_key=${key}`),
		);

		expect([basic.status, custom.status, query.status]).toEqual([401, 401, 401]);
		expect(consulted).toEqual([]);
	});

	it("authenticates nobody when no key service is mounted", async () => {
		const { app, service } = harness({ apiKeys: null });
		const { key } = await keyFor(service, "key-owner");

		const response = await app.request(renderRequest(bearer(key)));

		expect(response.status).toBe(401);
	});
});

describe("the ceiling on one key", () => {
	it("answers 429 with Retry-After once a key has made 120 requests in a minute", async () => {
		const { app, service } = harness();
		const { key } = await keyFor(service, "key-owner");
		for (let request = 0; request < 120; request += 1) {
			expect((await app.request(renderRequest(bearer(key)))).status).toBe(202);
		}

		const response = await app.request(renderRequest(bearer(key)));

		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("60");
		expect(await response.json()).toEqual({
			error: "Too many requests with this API key, try again in 60 seconds",
		});
	});

	it("does not touch a caller the cookie authenticated", async () => {
		const { app, service } = harness({ auth: cookieOf("cookie-owner") });
		const { key } = await keyFor(service, "key-owner");

		for (let request = 0; request < 130; request += 1) {
			const response = await app.request(
				renderRequest({ cookie: "session=valid", ...bearer(key) }),
			);
			expect(response.status).toBe(202);
		}
	});
});
