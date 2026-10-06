// @vitest-environment node
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type HostedDeps,
	type HostedInput,
	WAIT_MS,
	renderOnTypelapse,
	runHostedStep,
} from "../../cli/hosted-render";

/**
 * The Action's hosted output: with an API key it asks Typelapse to render the
 * pull request, waits for the job, publishes the render's page and hands the
 * links to the comment. Typelapse is a stub here, so these are the decisions:
 * what is sent and with what, how long the wait is, what each answer becomes,
 * and that the key stays in the Authorization header and in nothing printed.
 * The real server is the hosted journey's (tests/e2e/hosted/github-action.spec.ts).
 */

const ROOT = resolve(__dirname, "../..");
const KEY = `tlk_abcd1234_${"0123456789abcdef".repeat(4)}`;
const API = "https://api.typelapse.test";
const PR = "https://github.com/octocat/Hello-World/pull/1";
const STUDIO = "https://typelapse.test/app#import=eyJzb3VyY2UiOiJ4In0";
const PAGE = "https://typelapse.test/v/job_1";
const JOB = { id: "job_1", projectId: "import_x", revision: 1, status: "queued" };

function reply(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

const status =
	(value: string, extra: Record<string, unknown> = {}) =>
	() =>
		reply(200, { job: { ...JOB, status: value, ...extra } });
const QUEUED_RUNNING_DONE = [status("queued"), status("running"), status("succeeded")];

interface Script {
	post?: () => Response | Promise<Response>;
	/** What successive polls answer; the last answer repeats. */
	polls?: (() => Response)[];
	put?: () => Response;
}

interface Call {
	method: string;
	url: string;
	headers: Headers;
	body: unknown;
	redirect: RequestRedirect | undefined;
}

/** Typelapse, as far as the Action meets it: render by URL, the job, its page. */
function typelapse(script: Script = {}) {
	const calls: Call[] = [];
	let polled = 0;
	const answer = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = String(input);
		const method = init?.method ?? "GET";
		calls.push({
			method,
			url,
			headers: new Headers(init?.headers),
			body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
			redirect: init?.redirect,
		});
		const path = new URL(url).pathname;
		if (method === "POST" && path.endsWith("/api/cloud/render/source")) {
			return (script.post ?? (() => reply(202, { job: JOB, studioUrl: STUDIO })))();
		}
		if (method === "GET" && path.endsWith("/api/cloud/jobs/job_1")) {
			const polls = script.polls ?? QUEUED_RUNNING_DONE;
			const next = polls[Math.min(polled, polls.length - 1)] ?? status("succeeded");
			polled += 1;
			return next();
		}
		if (method === "PUT" && path.endsWith("/api/cloud/jobs/job_1/public")) {
			return (script.put ?? (() => reply(200, { page: { public: true, url: PAGE } })))();
		}
		throw new Error(`the stub was not expecting ${method} ${url}`);
	};
	return { fetch: answer as typeof fetch, calls };
}

/** A clock that only moves when the script sleeps, so a ten minute wait takes no time. */
function clock() {
	let now = 0;
	const slept: number[] = [];
	return {
		now: () => now,
		slept,
		sleep: async (ms: number) => {
			slept.push(ms);
			now += ms;
		},
	};
}

const INPUT: HostedInput = {
	apiKey: KEY,
	apiUrl: API,
	source: PR,
	format: "",
	size: "",
	fps: "",
	theme: "",
};

async function ask(script: Script = {}, input: Partial<HostedInput> = {}) {
	const server = typelapse(script);
	const time = clock();
	const lines: string[] = [];
	const deps: HostedDeps = {
		fetch: server.fetch,
		sleep: time.sleep,
		now: time.now,
		log: (line) => lines.push(line),
	};
	const result = await renderOnTypelapse({ ...INPUT, ...input }, deps);
	return { result, calls: server.calls, slept: time.slept, lines };
}

const route = (call: Call | undefined) => `${call?.method} ${new URL(call?.url ?? "").pathname}`;

/** A sentence the comment can put a full stop after: one line, and no stop of its own. */
function expectSentence(message: string): void {
	expect(message).not.toContain("\n");
	expect(message.endsWith(".")).toBe(false);
	expect(message.length).toBeGreaterThan(10);
}

describe("asking Typelapse to render the pull request", () => {
	it("asks render by URL, follows the job, publishes its page and answers with the page and the studio link", async () => {
		const { result, calls } = await ask();

		expect(result).toEqual({
			outcome: "rendered",
			jobId: "job_1",
			pageUrl: PAGE,
			studioUrl: STUDIO,
		});
		expect(calls.map(route)).toEqual([
			"POST /api/cloud/render/source",
			"GET /api/cloud/jobs/job_1",
			"GET /api/cloud/jobs/job_1",
			"GET /api/cloud/jobs/job_1",
			"PUT /api/cloud/jobs/job_1/public",
		]);
		expect(calls[0]?.body).toEqual({ source: PR });
		expect(calls.at(-1)?.body).toEqual({ public: true });
	});

	it("publishes the page itself: a render's page is private until its owner turns it on", async () => {
		const { calls } = await ask();

		const published = calls.findIndex((call) => call.method === "PUT");
		const lastPoll = calls.map((call) => call.method).lastIndexOf("GET");
		expect(published).toBeGreaterThan(lastPoll);
	});

	it("sends only the options the inputs set, under the names the route reads", async () => {
		const { calls } = await ask({}, { format: "WebM", size: "1280x720", fps: "30", theme: "nord" });

		expect(calls[0]?.body).toEqual({
			source: PR,
			renderOptions: { format: "webm", width: 1280, height: 720, fps: 30, theme: "nord" },
		});
	});

	it("sends no options at all when no input sets one, so the render is the studio's own", async () => {
		const { calls } = await ask();

		expect(calls[0]?.body).toEqual({ source: PR });
	});

	it("leaves a rate or a size the route will judge to the route, in the route's words", async () => {
		const { calls } = await ask({}, { fps: "25", size: "1281X721" });

		expect(calls[0]?.body).toEqual({
			source: PR,
			renderOptions: { width: 1281, height: 721, fps: 25 },
		});
	});

	it("carries the importer's notice to the comment", async () => {
		const notice = "46 commits, shown as one change";
		const { result } = await ask({
			post: () => reply(202, { job: JOB, studioUrl: STUDIO, notice }),
		});

		expect(result).toMatchObject({ outcome: "rendered", notice });
	});

	it.each([
		["https://api.typelapse.test", "https://api.typelapse.test/api/cloud/render/source"],
		["https://api.typelapse.test/", "https://api.typelapse.test/api/cloud/render/source"],
		["https://example.test/typelapse//", "https://example.test/typelapse/api/cloud/render/source"],
		["http://localhost:3191", "http://localhost:3191/api/cloud/render/source"],
		["http://127.0.0.1:3191/", "http://127.0.0.1:3191/api/cloud/render/source"],
		["http://[::1]:3191", "http://[::1]:3191/api/cloud/render/source"],
		["  https://api.typelapse.test  ", "https://api.typelapse.test/api/cloud/render/source"],
	])("takes the API address %j and calls %s", async (apiUrl, expected) => {
		const { calls } = await ask({}, { apiUrl });

		expect(calls[0]?.url).toBe(expected);
	});

	it("follows the job at the pace a key's rate limit allows", async () => {
		const { slept } = await ask({ polls: [...QUEUED_RUNNING_DONE] });

		expect(slept).toHaveLength(2);
		for (const wait of slept) {
			expect(wait).toBeGreaterThanOrEqual(1000);
			expect(wait).toBeLessThanOrEqual(5000);
		}
	});

	it("does not wait at all for a render that is already done", async () => {
		const { slept, result } = await ask({ polls: [status("succeeded")] });

		expect(slept).toEqual([]);
		expect(result.outcome).toBe("rendered");
	});
});

describe("the key", () => {
	it("travels in the Authorization header of every request and in nothing else", async () => {
		const { calls, result, lines } = await ask();

		for (const call of calls) {
			expect(call.headers.get("authorization")).toBe(`Bearer ${KEY}`);
			expect(call.url).not.toContain(KEY);
			expect(JSON.stringify(call.body ?? null)).not.toContain(KEY);
			const carrying = [...call.headers].filter(([, value]) => value.includes(KEY));
			expect(carrying.map(([name]) => name)).toEqual(["authorization"]);
		}
		expect(JSON.stringify(result)).not.toContain(KEY);
		expect(lines.join("\n")).not.toContain(KEY);
	});

	it("is trimmed, so a newline pasted with the secret does not break the header", async () => {
		const { calls } = await ask({}, { apiKey: `${KEY}\n` });

		expect(calls[0]?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
	});

	it("is never echoed back, even by a server that quotes the request in its answer", async () => {
		const { result, lines } = await ask(
			{ post: () => reply(400, { error: `Rejected: authorization was Bearer ${KEY}` }) },
			{},
		);

		expect(result.outcome).toBe("unavailable");
		expect(JSON.stringify(result)).not.toContain(KEY);
		expect(lines.join("\n")).not.toContain(KEY);
	});

	it("is never sent over plain http to another machine, nor to an address that carries a login", async () => {
		for (const apiUrl of [
			"http://api.typelapse.test",
			"http://192.168.1.20:3001",
			"http://localhost.evil.test",
			"http://127.0.0.1.evil.test",
			"ftp://api.typelapse.test",
			"https://user:secret@api.typelapse.test",
			"api.typelapse.test",
			"not an address",
		]) {
			const { result, calls } = await ask({}, { apiUrl });

			expect(result.outcome, apiUrl).toBe("unavailable");
			expect(calls, apiUrl).toEqual([]);
			expect(JSON.stringify(result), apiUrl).not.toContain(KEY);
		}
	});

	it("does not follow a redirect, which would hand it to wherever the answer points", async () => {
		const { result, calls } = await ask({
			post: () =>
				reply(307, undefined, { location: "https://elsewhere.test/api/cloud/render/source" }),
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.redirect).toBe("manual");
		expect(result).toEqual({
			outcome: "unavailable",
			error: "Typelapse answered with a redirect, so set api-url to its final address",
		});
	});

	it("asks nothing when it is empty", async () => {
		const { result, calls } = await ask({}, { apiKey: "  " });

		expect(result.outcome).toBe("unavailable");
		expect(calls).toEqual([]);
	});
});

describe("when Typelapse does not deliver the video", () => {
	it("hands a free account the studio link, and asks nothing more", async () => {
		const { result, calls } = await ask({
			post: () =>
				reply(200, {
					studioUrl: STUDIO,
					notice: "That diff is too long to travel in a link, so the studio opens empty",
					reason: { error: "Hosted renders come with Creator", code: "plan-limit", plan: "free" },
				}),
		});

		expect(result).toEqual({
			outcome: "free",
			studioUrl: STUDIO,
			notice: "That diff is too long to travel in a link, so the studio opens empty",
		});
		expect(calls.map(route)).toEqual(["POST /api/cloud/render/source"]);
	});

	it.each([
		[
			"a key that is not valid",
			() =>
				reply(401, { error: "This API key is not valid: it may be unknown, revoked or expired" }),
			"This API key is not valid: it may be unknown, revoked or expired",
		],
		[
			"a ceiling of the plan",
			() =>
				reply(402, {
					error:
						"Creator includes 60 minutes of hosted output a month and this render goes past it",
					code: "plan-limit",
				}),
			"Creator includes 60 minutes of hosted output a month and this render goes past it",
		],
		[
			"a repository Typelapse cannot read",
			() =>
				reply(422, {
					error:
						"That pull request was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
					code: "source-not-found",
				}),
			"That pull request was not found, or its repository is private; Typelapse reads public repositories only, so send a diff as the source instead",
		],
		[
			"a theme the studio does not have",
			() => reply(400, { error: "Hosted render theme must be midnight or nord" }),
			"Hosted render theme must be midnight or nord",
		],
		[
			"a key that is asking too often",
			() =>
				reply(
					429,
					{ error: "Too many requests with this API key, try again in 12 seconds" },
					{ "retry-after": "12" },
				),
			"Too many requests with this API key, try again in 12 seconds",
		],
		[
			"a deployment that cannot render by URL",
			() => reply(503, { error: "Render by URL is not configured" }),
			"Render by URL is not configured",
		],
		[
			"a proxy's page instead of an answer",
			() => new Response("<html>Bad gateway</html>", { status: 502 }),
			"Typelapse answered 502",
		],
		[
			"an answer that is not what render by URL says",
			() => reply(200, { hello: "world" }),
			"Typelapse answered in a way this Action does not understand",
		],
		[
			"a job with no id",
			() => reply(202, { job: {}, studioUrl: STUDIO }),
			"Typelapse answered in a way this Action does not understand",
		],
	])(
		"gives up on %s with the server's own sentence, and asks nothing more",
		async (_case, post, error) => {
			const { result, calls } = await ask({ post });

			expect(result).toEqual({ outcome: "unavailable", error });
			expectSentence(error);
			expect(calls).toHaveLength(1);
		},
	);

	it("says when Typelapse cannot be reached, naming the address and nothing else", async () => {
		const failing = (async () => {
			throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
		}) as typeof fetch;

		const result = await renderOnTypelapse(
			{ ...INPUT, apiUrl: "https://api.typelapse.test/typelapse" },
			{ fetch: failing, sleep: async () => undefined, now: () => 0, log: () => undefined },
		);

		expect(result).toEqual({
			outcome: "unavailable",
			error: "Typelapse could not be reached at https://api.typelapse.test",
		});
	});

	it("says a render that failed, or was canceled, with its code", async () => {
		const failed = await ask({
			polls: [status("running"), status("failed", { errorCode: "render-processing-failed" })],
		});
		const canceled = await ask({ polls: [status("canceled")] });

		expect(failed.result).toEqual({
			outcome: "unavailable",
			error: "The hosted render failed (render-processing-failed)",
		});
		expect(canceled.result).toEqual({
			outcome: "unavailable",
			error: "The hosted render was canceled",
		});
		expect(failed.calls.some((call) => call.method === "PUT")).toBe(false);
	});

	it("gives up on a render still running after ten minutes, and never publishes it", async () => {
		const { result, calls, slept } = await ask({ polls: [status("running")] });

		expect(WAIT_MS).toBe(10 * 60_000);
		expect(result).toEqual({
			outcome: "unavailable",
			error: "The hosted render was still running after 10 minutes",
		});
		const waited = slept.reduce((total, ms) => total + ms, 0);
		expect(waited).toBeGreaterThanOrEqual(WAIT_MS);
		expect(waited).toBeLessThan(WAIT_MS + 5000);
		expect(calls.some((call) => call.method === "PUT")).toBe(false);
		// Polled, but never faster than a key may: far fewer than one a second.
		expect(calls.length).toBeLessThan(WAIT_MS / 1000 / 2);
	});

	it("rides out a poll or two that fail, and carries on", async () => {
		const { result } = await ask({
			polls: [
				() => reply(503, { error: "Render output is temporarily unavailable" }),
				() => reply(502, undefined),
				status("succeeded"),
			],
		});

		expect(result.outcome).toBe("rendered");
	});

	it("stops asking once the polls have failed several times in a row", async () => {
		const { result, calls } = await ask({
			polls: [() => reply(503, { error: "Render output is temporarily unavailable" })],
		});

		expect(result).toEqual({
			outcome: "unavailable",
			error: "Typelapse stopped answering while the render ran",
		});
		expect(calls.filter((call) => call.method === "GET").length).toBeLessThan(10);
	});

	it("waits as long as a rate-limited poll is told to, then carries on", async () => {
		const { result, slept } = await ask({
			polls: [
				() => reply(429, { error: "Too many requests" }, { "retry-after": "7" }),
				status("succeeded"),
			],
		});

		expect(slept).toEqual([7000]);
		expect(result.outcome).toBe("rendered");
	});

	it("gives up when the job is not found, which is what a key of another account would see", async () => {
		const { result } = await ask({ polls: [() => reply(404, { error: "Render job not found" })] });

		expect(result).toEqual({ outcome: "unavailable", error: "Render job not found" });
	});

	it("says when the page of a finished render cannot be published", async () => {
		const { result } = await ask({
			put: () => reply(402, { error: "Hosted renders come with Creator", code: "plan-limit" }),
		});

		expect(result).toEqual({
			outcome: "unavailable",
			error:
				"The render finished, but its page could not be published: Hosted renders come with Creator",
		});
	});

	it("does not take an address for the page that is not one", async () => {
		const { result } = await ask({
			put: () => reply(200, { page: { public: true, url: "javascript:alert(1)" } }),
		});

		expect(result.outcome).toBe("unavailable");
	});

	it("renders a GIF on the runner, and asks Typelapse nothing", async () => {
		const { result, calls } = await ask({}, { format: "gif" });

		expect(calls).toEqual([]);
		expect(result).toEqual({
			outcome: "unavailable",
			error: "Hosted renders are MP4 or WebM",
		});
	});

	it("asks nothing for a size it cannot read", async () => {
		const { result, calls } = await ask({}, { size: "wide" });

		expect(calls).toEqual([]);
		expect(result).toEqual({
			outcome: "unavailable",
			error: "The size input takes WIDTHxHEIGHT such as 1920x1080, not 'wide'",
		});
	});

	it("says there is no server to ask when api-url is empty", async () => {
		const { result, calls } = await ask({}, { apiUrl: "" });

		expect(calls).toEqual([]);
		expect(result).toEqual({
			outcome: "unavailable",
			error: "The api-url input is empty, so there is no Typelapse server to ask",
		});
	});

	it("says every refusal as one line without a full stop, so the comment can end it", async () => {
		for (const input of [{ apiUrl: "http://api.typelapse.test" }, { apiUrl: "" }, { size: "x" }]) {
			const { result } = await ask({}, input);
			if (result.outcome !== "unavailable") throw new Error("expected a refusal");
			expectSentence(result.error);
		}
	});
});

describe("the hosted step", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "typelapse-hosted-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const envIn = (overrides: Record<string, string> = {}) => ({
		TYPELAPSE_API_KEY: KEY,
		TYPELAPSE_API_URL: API,
		SOURCE: PR,
		FORMAT: "",
		SIZE: "",
		FPS: "",
		THEME: "",
		TYPELAPSE_FORK: "false",
		GITHUB_OUTPUT: join(dir, "output"),
		GITHUB_STEP_SUMMARY: join(dir, "summary"),
		TYPELAPSE_HOSTED_RESULT: join(dir, "hosted.json"),
		...overrides,
	});

	async function step(overrides: Record<string, string> = {}, script: Script = {}) {
		const server = typelapse(script);
		const time = clock();
		const lines: string[] = [];
		const env = envIn(overrides);
		const result = await runHostedStep(env, {
			fetch: server.fetch,
			sleep: time.sleep,
			now: time.now,
			log: (line) => lines.push(line),
		});
		const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
		return {
			result,
			calls: server.calls,
			lines,
			outputs: read(env.GITHUB_OUTPUT),
			summary: read(env.GITHUB_STEP_SUMMARY),
			hosted: read(env.TYPELAPSE_HOSTED_RESULT),
		};
	}

	it("leaves the page and the studio link where the next steps read them", async () => {
		const { outputs, hosted, result } = await step();

		expect(result).toMatchObject({ outcome: "rendered", pageUrl: PAGE });
		expect(outputs?.split("\n").filter(Boolean)).toEqual([
			"rendered=true",
			`share-url=${PAGE}`,
			`studio-url=${STUDIO}`,
		]);
		expect(JSON.parse(hosted ?? "null")).toEqual(result);
	});

	it("tells the log what it asked and what it published, never with the key", async () => {
		const { lines } = await step();

		expect(lines.length).toBeGreaterThan(1);
		expect(lines.join("\n")).toContain(PAGE);
		expect(lines.join("\n")).not.toContain(KEY);
	});

	it("leaves a free account's studio address for the runner's own comment to link", async () => {
		const { outputs, hosted } = await step(
			{},
			{ post: () => reply(200, { studioUrl: STUDIO, reason: { plan: "free" } }) },
		);

		expect(outputs?.split("\n").filter(Boolean)).toEqual([
			"rendered=false",
			`studio-url=${STUDIO}`,
			"studio-base=https://typelapse.test/app",
		]);
		expect(JSON.parse(hosted ?? "null")).toEqual({ outcome: "free", studioUrl: STUDIO });
	});

	it("annotates what went wrong once, on one line, and leaves the runner to render", async () => {
		const { lines, outputs, hosted } = await step(
			{},
			{
				post: () =>
					reply(401, { error: "This API key is not valid: it may be unknown, revoked or expired" }),
			},
		);

		const warnings = lines.filter((line) => line.startsWith("::warning"));
		expect(warnings).toEqual([
			"::warning title=Typelapse::This API key is not valid: it may be unknown, revoked or expired. The video rendered on this runner instead.",
		]);
		expect(outputs?.split("\n").filter(Boolean)).toEqual(["rendered=false"]);
		expect(JSON.parse(hosted ?? "null")).toMatchObject({ outcome: "unavailable" });
	});

	it("keeps a server's words from starting a workflow command of their own", async () => {
		const { lines, hosted } = await step(
			{},
			{ post: () => reply(400, { error: "First line\n::error::second 100%" }) },
		);

		// One line, so nothing after it can begin a command; the percent sign is escaped.
		expect(JSON.parse(hosted ?? "null").error).toBe("First line ::error::second 100%");
		expect(lines.filter((line) => line.startsWith("::"))).toEqual([
			"::warning title=Typelapse::First line ::error::second 100%25. The video rendered on this runner instead.",
		]);
	});

	it("never writes the key to the log, the outputs, the summary or the result", async () => {
		for (const script of [
			{},
			{ post: () => reply(400, { error: `Bad Bearer ${KEY}` }) },
			{ post: () => reply(200, { studioUrl: STUDIO, reason: { plan: "free" } }) },
		]) {
			const { lines, outputs, summary, hosted } = await step({}, script);

			for (const written of [lines.join("\n"), outputs, summary, hosted]) {
				expect(written ?? "").not.toContain(KEY);
			}
		}
	});

	it("does nothing, and asks nothing, with neither a key nor an address: the free path as it was", async () => {
		const { result, calls, lines, outputs, summary, hosted } = await step({
			TYPELAPSE_API_KEY: "",
			TYPELAPSE_API_URL: "",
		});

		expect(result).toBeNull();
		expect(calls).toEqual([]);
		expect([lines, outputs, summary, hosted]).toEqual([[], null, null, null]);
	});

	it("says in the job summary that a fork has no key, and renders on the runner", async () => {
		const { result, calls, summary, outputs, hosted } = await step({
			TYPELAPSE_API_KEY: "",
			TYPELAPSE_FORK: "true",
		});

		expect(result).toBeNull();
		expect(calls).toEqual([]);
		expect(summary).toBe(
			"This pull request comes from a fork, and GitHub gives a fork's workflow no secrets, so the API key did not arrive and the video rendered on this runner.\n",
		);
		expect(outputs?.split("\n").filter(Boolean)).toEqual(["rendered=false"]);
		expect(hosted).toBeNull();
	});

	it("says it of an empty key on any other run, in other words", async () => {
		const { summary } = await step({ TYPELAPSE_API_KEY: "" });

		expect(summary).toBe(
			"The api-key input is empty, so the video rendered on this runner instead of on Typelapse.\n",
		);
	});

	it("is never the reason a job fails: whatever goes wrong, it finishes and leaves the runner to render", async () => {
		const exploding = (async () => {
			throw "not even an Error";
		}) as typeof fetch;
		const env = envIn();

		const result = await runHostedStep(env, {
			fetch: exploding,
			sleep: async () => undefined,
			now: () => 0,
			log: () => undefined,
		});

		expect(result).toMatchObject({ outcome: "unavailable" });
		expect(readFileSync(env.GITHUB_OUTPUT, "utf8")).toBe("rendered=false\n");
	});
});

describe("the script, run the way the runner runs it", () => {
	let dir: string;
	let server: Server;
	let origin: string;
	const seen: { method: string; url: string; authorization: string | undefined; body: string }[] =
		[];

	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), "typelapse-hosted-process-"));
		seen.length = 0;
		server = createServer((request: IncomingMessage, response: ServerResponse) => {
			const chunks: Buffer[] = [];
			request.on("data", (chunk: Buffer) => chunks.push(chunk));
			request.on("end", () => {
				const path = request.url ?? "";
				seen.push({
					method: request.method ?? "",
					url: path,
					authorization: request.headers.authorization,
					body: Buffer.concat(chunks).toString("utf8"),
				});
				response.setHeader("content-type", "application/json");
				if (request.method === "POST") {
					response.statusCode = 202;
					response.end(JSON.stringify({ job: JOB, studioUrl: STUDIO }));
				} else if (request.method === "GET") {
					response.end(JSON.stringify({ job: { ...JOB, status: "succeeded" } }));
				} else {
					response.end(JSON.stringify({ page: { public: true, url: PAGE } }));
				}
			});
		});
		await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterEach(async () => {
		await new Promise<void>((done) => server.close(() => done()));
		rmSync(dir, { recursive: true, force: true });
	});

	it("reads its environment, asks the server and leaves the files the next steps read", async () => {
		const run = promisify(execFile);

		const { stdout, stderr } = await run(
			resolve(ROOT, "node_modules/.bin/tsx"),
			["cli/hosted-render.ts"],
			{
				cwd: ROOT,
				env: {
					PATH: process.env.PATH ?? "",
					HOME: process.env.HOME ?? "",
					TMPDIR: process.env.TMPDIR ?? "",
					TYPELAPSE_API_KEY: KEY,
					TYPELAPSE_API_URL: origin,
					SOURCE: PR,
					THEME: "nord",
					GITHUB_OUTPUT: join(dir, "output"),
					GITHUB_STEP_SUMMARY: join(dir, "summary"),
					TYPELAPSE_HOSTED_RESULT: join(dir, "hosted.json"),
				},
			},
		);

		expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
			"POST /api/cloud/render/source",
			"GET /api/cloud/jobs/job_1",
			"PUT /api/cloud/jobs/job_1/public",
		]);
		for (const call of seen) {
			expect(call.authorization).toBe(`Bearer ${KEY}`);
		}
		expect(JSON.parse(seen[0]?.body ?? "{}")).toEqual({
			source: PR,
			renderOptions: { theme: "nord" },
		});
		expect(readFileSync(join(dir, "output"), "utf8").split("\n").filter(Boolean)).toEqual([
			"rendered=true",
			`share-url=${PAGE}`,
			`studio-url=${STUDIO}`,
		]);
		expect(JSON.parse(readFileSync(join(dir, "hosted.json"), "utf8"))).toMatchObject({
			outcome: "rendered",
			pageUrl: PAGE,
		});
		expect(`${stdout}${stderr}`).not.toContain(KEY);
	}, 30_000);
});
