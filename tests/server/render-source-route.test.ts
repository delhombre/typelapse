import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApiKeyService } from "../../server/auth/api-keys";
import { createCloudRoute } from "../../server/routes/cloud";
import { planLimitRefusal } from "../../src/application/billing/plan-allowance";
import { IMPORT_HASH_KEY } from "../../src/application/import/import-link";
import type {
	RenderBySourceRequest,
	RenderBySourceResult,
	RenderBySourceService,
} from "../../src/application/render/render-by-source";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import { Plan } from "../../src/domain/value-objects/plan";
import { MemoryApiKeyRepository } from "./memory-api-key-repository";

/**
 * `POST /api/cloud/render/source`: a key or a session, and a source, start a
 * render on a Creator and open the studio for everyone else. The use case behind
 * it has its own tests; these hold the route to what it promises on the wire.
 */

const NOW = new Date("2026-10-05T12:00:00.000Z");
const APP = "https://typelapse.test";
const PR = "https://github.com/octocat/Hello-World/pull/1";
const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,4 @@
 export function greet(name: string) {
-  return "Hello " + name;
+  return \`Hello, \${name.trim()}\`;
 }
`;

const job = {
	id: "job_1",
	projectId: "import_0123456789abcdef0123456789abcdef",
	revision: 1,
	status: "queued" as const,
	createdAt: NOW,
	completedAt: null,
};

const signedOut: AuthPort = { verify: async () => null };
const cookieOf = (accountId: string): AuthPort => ({
	verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
});

function sources(answer: RenderBySourceResult = { outcome: "queued", job }) {
	const received: RenderBySourceRequest[] = [];
	const service: RenderBySourceService = {
		submit: async (request) => {
			received.push(request);
			return answer;
		},
	};
	return { service, received };
}

async function harness(
	options: {
		plan?: Plan;
		answer?: RenderBySourceResult;
		auth?: AuthPort;
		service?: RenderBySourceService | null;
		appUrl?: string | null;
	} = {},
) {
	const repository = new MemoryApiKeyRepository();
	const keys = createApiKeyService({ repository });
	const created = await keys.create({
		ownerId: "key-owner",
		name: "ci",
		expiresInDays: null,
		now: NOW,
	});
	if (created.outcome !== "created") throw new Error("expected a key");
	const recorded = sources(options.answer);
	const service = options.service === undefined ? recorded.service : options.service;
	const app = new Hono().route(
		"/api/cloud",
		createCloudRoute({
			auth: options.auth ?? signedOut,
			subscriptions: { planFor: async () => options.plan ?? Plan.pro() },
			apiKeys: keys,
			...(service ? { renderSources: service } : {}),
			...(options.appUrl === null ? {} : { appUrl: options.appUrl ?? APP }),
			now: () => NOW,
		}),
	);
	const call = (body: unknown, headers: Record<string, string> = {}) =>
		app.request(
			new Request("http://localhost/api/cloud/render/source", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${created.key}`,
					...headers,
				},
				body: typeof body === "string" ? body : JSON.stringify(body),
			}),
		);
	return { app, call, key: created.key, received: recorded.received };
}

const decodeIntent = (url: string) =>
	JSON.parse(Buffer.from(url.split(IMPORT_HASH_KEY)[1] ?? "", "base64url").toString("utf8"));

describe("a Creator's render by URL", () => {
	it("queues a render for the account the key belongs to and answers with the job and the studio link", async () => {
		const { call, received } = await harness();

		const response = await call({ source: PR });

		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body).toEqual({
			job: { ...job, createdAt: NOW.toISOString() },
			studioUrl: expect.stringMatching(new RegExp(`^${APP}/app${IMPORT_HASH_KEY}`)),
		});
		expect(decodeIntent(body.studioUrl)).toEqual({ source: PR });
		expect(received).toEqual([
			{
				ownerId: "key-owner",
				plan: expect.objectContaining({ tier: "pro" }),
				source: { kind: "pr", ref: { owner: "octocat", repo: "Hello-World", number: 1 } },
				renderOptions: { format: "mp4", width: 1920, height: 1080, fps: 60, includeAudio: true },
				now: NOW,
			},
		]);
	});

	it("starts it for a signed-in session as well, which wins over a key", async () => {
		const { call, received } = await harness({ auth: cookieOf("cookie-owner") });

		const response = await call({ source: PR }, { cookie: "session=valid" });

		expect(response.status).toBe(202);
		expect(received.map((request) => request.ownerId)).toEqual(["cookie-owner"]);
	});

	it("renders a diff too, and links the studio to it", async () => {
		const { call, received } = await harness();

		const response = await call({ source: DIFF });

		expect(response.status).toBe(202);
		expect(received[0]?.source).toEqual({ kind: "diff", text: DIFF.trim() });
		expect(decodeIntent((await response.json()).studioUrl)).toEqual({ source: DIFF.trim() });
	});

	it("takes the options a caller changes and keeps the studio's defaults for the rest", async () => {
		const { call, received } = await harness();

		await call({
			source: PR,
			renderOptions: { format: "webm", width: 1280, height: 720, fps: 24 },
		});

		expect(received[0]?.renderOptions).toEqual({
			format: "webm",
			width: 1280,
			height: 720,
			fps: 24,
			includeAudio: true,
		});
	});

	it("takes a theme among the options and hands it over beside them, not inside them", async () => {
		const { call, received } = await harness();

		await call({ source: PR, renderOptions: { format: "webm", theme: "nord" } });

		expect(received[0]?.theme).toBe("nord");
		expect(received[0]?.renderOptions).toEqual({
			format: "webm",
			width: 1920,
			height: 1080,
			fps: 60,
			includeAudio: true,
		});
	});

	it("asks for no theme when none is sent, so the project keeps the studio's own", async () => {
		const { call, received } = await harness();

		await call({ source: PR, renderOptions: { fps: 30 } });
		await call({ source: PR });

		expect(received).toHaveLength(2);
		for (const request of received) {
			expect(request).not.toHaveProperty("theme");
		}
	});

	it("says what is unusual about a release, without making it a refusal", async () => {
		const { call } = await harness({
			answer: {
				outcome: "queued",
				job,
				notice: "v0.1.0 is the first tag, so the video runs from the first commit",
			},
		});

		const body = await (
			await call({ source: "https://github.com/octocat/Hello-World/releases/tag/v0.1.0" })
		).json();

		expect(body.notice).toBe("v0.1.0 is the first tag, so the video runs from the first commit");
	});

	it("says so when the diff is too long for the studio link to carry it", async () => {
		const { call } = await harness();
		const long = `${DIFF}${"+  const another = 1;\n".repeat(400)}`;

		const response = await call({ source: long });

		expect(response.status).toBe(202);
		const body = await response.json();
		expect(body.studioUrl).toBe(`${APP}/app`);
		expect(body.notice).toBe("That diff is too long to travel in a link, so the studio opens empty");
	});

	it("writes the studio link on the request's own origin when no address is configured", async () => {
		const { call } = await harness({ appUrl: null });

		const body = await (await call({ source: PR })).json();

		expect(body.studioUrl.startsWith("http://localhost/app#import=")).toBe(true);
	});

	it("never takes the plan or the owner from the body", async () => {
		const { call, received } = await harness({ plan: Plan.pro() });

		await call({ source: PR, plan: "team", ownerId: "someone-else", accountId: "someone-else" });

		expect(received[0]?.ownerId).toBe("key-owner");
		expect(received[0]?.plan.tier).toBe("pro");
	});
});

describe("a free account's render by URL", () => {
	it("is the studio link and the reason there is no job, and nothing is fetched or saved", async () => {
		const { call, received } = await harness({ plan: Plan.free() });

		const response = await call({ source: PR });

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({
			studioUrl: expect.stringMatching(new RegExp(`^${APP}/app${IMPORT_HASH_KEY}`)),
			reason: planLimitRefusal(Plan.free(), "hostedRenderTime", 0),
		});
		expect(body.reason).toEqual({
			error: "Hosted renders come with Creator",
			code: "plan-limit",
			ceiling: "hostedRenderTime",
			limit: 0,
			used: 0,
			plan: "free",
			upgradeTo: "creator",
		});
		expect(body.job).toBeUndefined();
		expect(decodeIntent(body.studioUrl)).toEqual({ source: PR });
		expect(received).toEqual([]);
	});

	it("opens the studio empty for a diff too long to travel in a link, and says so", async () => {
		const { call } = await harness({ plan: Plan.free() });
		const long = `${DIFF}${"+  const another = 1;\n".repeat(400)}`;

		const body = await (await call({ source: long })).json();

		expect(body.studioUrl).toBe(`${APP}/app`);
		expect(body.notice).toBe("That diff is too long to travel in a link, so the studio opens empty");
		expect(body.reason.code).toBe("plan-limit");
	});

	it("is answered before the service is asked, so it needs none", async () => {
		const { call } = await harness({ plan: Plan.free(), service: null });

		expect((await call({ source: PR })).status).toBe(200);
	});

	it("still refuses what is not a source, as it does for a Creator", async () => {
		const { call } = await harness({ plan: Plan.free() });

		expect((await call({ source: "const a = 1;" })).status).toBe(400);
	});
});

describe("a request the route refuses before it asks anyone", () => {
	it("is a 401 for a caller with no credential, a key that is unknown included", async () => {
		const { app } = await harness();
		const send = (headers: Record<string, string>) =>
			app.request(
				new Request("http://localhost/api/cloud/render/source", {
					method: "POST",
					headers: { "content-type": "application/json", ...headers },
					body: JSON.stringify({ source: PR }),
				}),
			);

		expect((await send({})).status).toBe(401);
		expect((await send({ authorization: `Bearer tlk_00000000_${"0".repeat(64)}` })).status).toBe(
			401,
		);
	});

	it("is a 415 unless the body says it is JSON", async () => {
		const { call, received } = await harness();

		const response = await call(JSON.stringify({ source: PR }), {
			"content-type": "text/plain",
		});

		expect(response.status).toBe(415);
		expect(await response.json()).toEqual({
			error: 'Send the source as JSON: { "source": "<link or diff>" }',
		});
		expect(received).toEqual([]);
	});

	it.each([
		["a body that is not JSON", "{not json"],
		["a body that is not an object", ["source"]],
		["no source", {}],
		["a source that is not text", { source: 42 }],
	])("is a 400 for %s", async (_case, body) => {
		const { call, received } = await harness();

		const response = await call(body);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Send the source as a string: { "source": "<link or diff>" }',
		});
		expect(received).toEqual([]);
	});

	it.each([
		["", "Send a pull request, commit, release or compare link, or a unified diff"],
		[
			"https://gitlab.com/a/b/-/merge_requests/1",
			"That link is not a GitHub pull request, commit, release or compare link",
		],
		["const a = 1;", "The source is neither a GitHub link nor a unified diff"],
	])(
		"is a 400 for the source %j, in one sentence that says what to send",
		async (source, error) => {
			const { call, received } = await harness();

			const response = await call({ source });

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error });
			expect(received).toEqual([]);
		},
	);

	it.each([
		[{ width: 1280 }, "Send width and height together"],
		[{ format: "gif" }, "Unsupported hosted render format"],
		[{ fps: 25 }, "Hosted render fps must be 24, 30 or 60"],
		[
			{ theme: "solarized" },
			"Hosted render theme must be midnight, aurora, frost, dracula, one-dark, catppuccin or nord",
		],
		["mp4", "Render options must be an object"],
	])("is a 400 for the render options %j", async (renderOptions, error) => {
		const { call, received } = await harness();

		const response = await call({ source: PR, renderOptions });

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error });
		expect(received).toEqual([]);
	});

	it("is a 413 for a body past the ceiling, which no diff GitHub serves reaches", async () => {
		const { call, received } = await harness();

		const response = await call({ source: `${DIFF}${"+ x\n".repeat(1_200_000)}` });

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: "Render request is too large" });
		expect(received).toEqual([]);
	});

	it("is a 503 for a Creator when the deployment has no way to render by URL", async () => {
		const { call } = await harness({ service: null });

		const response = await call({ source: PR });

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "Render by URL is not configured" });
	});
});

describe("what the use case answers, on the wire", () => {
	const answers: [string, RenderBySourceResult, number, object][] = [
		[
			"the month's minutes",
			{ outcome: "plan-limit", ceiling: "hostedRenderTime", used: 3_599_000 },
			402,
			planLimitRefusal(Plan.pro(), "hostedRenderTime", 3_599_000),
		],
		[
			"the renders already running, which clears by itself and so is a 429",
			{ outcome: "plan-limit", ceiling: "concurrentRenders", used: 3 },
			429,
			planLimitRefusal(Plan.pro(), "concurrentRenders", 3),
		],
		[
			"a size past the plan",
			{
				outcome: "resolution-limit",
				message: "Creator renders up to 3840×2160 in either orientation, and 3840×3840 is larger",
			},
			402,
			{
				error: "Creator renders up to 3840×2160 in either orientation, and 3840×3840 is larger",
				code: "resolution-limit",
			},
		],
		[
			"a source GitHub does not show, or that is private",
			{
				outcome: "source-refused",
				failure: "not-found",
				message: "That pull request was not found",
			},
			422,
			{ error: "That pull request was not found", code: "source-not-found" },
		],
		[
			"a diff too large to serve",
			{ outcome: "source-refused", failure: "too-large", message: "too large" },
			422,
			{ error: "too large", code: "source-too-large" },
		],
		[
			"a range too large to compare",
			{ outcome: "source-refused", failure: "range-too-large", message: "range" },
			422,
			{ error: "range", code: "source-too-large" },
		],
		[
			"a source with nothing to animate",
			{ outcome: "source-refused", failure: "other", message: "nothing to animate" },
			422,
			{ error: "nothing to animate", code: "source-unusable" },
		],
		[
			"GitHub's rate limit",
			{ outcome: "source-refused", failure: "rate-limit", message: "rate limit" },
			503,
			{ error: "rate limit", code: "source-rate-limited" },
		],
		[
			"GitHub not answering",
			{ outcome: "source-refused", failure: "timeout", message: "slow" },
			502,
			{ error: "slow", code: "source-unavailable" },
		],
		[
			"a read that outlasted this server's budget",
			{ outcome: "source-refused", failure: "budget", message: "too slow" },
			504,
			{ error: "too slow", code: "source-too-slow" },
		],
		[
			"GitHub not reachable",
			{ outcome: "source-refused", failure: "unreachable", message: "away" },
			502,
			{ error: "away", code: "source-unavailable" },
		],
		[
			"GitHub giving nothing for a change that should be there",
			{ outcome: "source-refused", failure: "unfetchable", message: "nothing" },
			502,
			{ error: "nothing", code: "source-unavailable" },
		],
		[
			"a project that moved while it was saved",
			{ outcome: "conflict" },
			409,
			{
				error: "The project changed while it was being saved; send the request again",
				code: "conflict",
			},
		],
	];

	it.each(answers)("says %s", async (_case, answer, status, body) => {
		const { call } = await harness({ answer });

		const response = await call({ source: PR });

		expect(response.status).toBe(status);
		expect(await response.json()).toEqual(body);
	});
});
