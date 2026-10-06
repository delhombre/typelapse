/**
 * The GitHub Action's hosted output. With an API key the Action asks Typelapse
 * to render the source instead of rendering on the runner: it calls render by
 * URL, waits for the job, publishes the render's page (a page is private until
 * its owner turns it on, and render by URL reads public repositories only) and
 * leaves the links for the comment. Whatever does not end in a published page,
 * a free account included, leaves the runner to render as it always did, so a
 * key never takes the free path away and a Typelapse outage never reddens a
 * pull request.
 *
 * The key is the one secret here. It goes in the Authorization header of
 * requests to the address the workflow named, over https (or http to this
 * machine), with redirects refused; it is never in a URL, an argument, a file or
 * a line printed, and anything a server says is scrubbed of it before it leaves
 * this module.
 *
 * No `@/` imports: the Action runs this with plain tsx, outside the CLI's loader.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
	resolveCommitUrl,
	resolveCompareUrl,
	resolvePrUrl,
	resolveReleaseUrl,
} from "@/application/import/pr-url";
import type { HostedResult } from "./pr-comment";

/** How long the Action waits for a hosted render before the runner renders instead. */
export const WAIT_MS = 10 * 60_000;

/** A key may make 120 requests a minute; one every two seconds or slower stays far under. */
const FIRST_POLL_MS = 2000;
const LAST_POLL_MS = 5000;
const POLL_GROWTH = 1.5;
/** Polls that fail one after another before the wait is given up. */
const MAX_FAILED_POLLS = 3;
const REQUEST_TIMEOUT_MS = 60_000;
/** Long enough for a sentence, short enough for a comment. */
const MAX_SENTENCE = 300;
/** A real key is far longer; a shorter string would scrub ordinary words. */
const MIN_SCRUBBED_KEY = 8;

const NOT_UNDERSTOOD = "Typelapse answered in a way this Action does not understand";
const REDIRECTED = "Typelapse answered with a redirect, so set api-url to its final address";

export interface HostedInput {
	/** The key as the workflow gave it; trimmed here. Empty when there is none. */
	apiKey: string;
	/** The deployment's address: until Typelapse has a public one, the workflow names it. */
	apiUrl: string;
	/** The Action's `source`: a pull request, commit, release or compare link, or a diff. */
	source: string;
	/** The Action's inputs as they are, empty when unset. */
	format: string;
	size: string;
	fps: string;
	theme: string;
}

/** What the script needs from the machine, so the decisions can be tested without one. */
export interface HostedDeps {
	fetch: typeof fetch;
	sleep: (ms: number) => Promise<void>;
	/** The clock the wait is bounded by, in milliseconds. */
	now: () => number;
	log: (line: string) => void;
}

const unavailable = (error: string): HostedResult => ({ outcome: "unavailable", error });

/**
 * Only a bare GitHub link goes to Typelapse's servers: the route renders it and
 * publishes the page, so a diff passed as text would be made public (next-wave
 * D11). Anything else is the runner's to render.
 */
function isGitHubLink(source: string): boolean {
	const link = source.trim();
	return (
		link !== "" &&
		!/\s/.test(link) &&
		[resolvePrUrl, resolveCommitUrl, resolveReleaseUrl, resolveCompareUrl].some((resolve) =>
			resolve(link),
		)
	);
}

/** One line with no full stop, so the comment can end it and a server's words stay one clause. */
function oneSentence(text: string): string {
	const line = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
	return line.length > MAX_SENTENCE ? `${line.slice(0, MAX_SENTENCE - 1).trimEnd()}…` : line;
}

/** An address a link may point at: http or https, normalised, with nothing that ends a Markdown link. */
function webUrl(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return null;
		}
		return url.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
	} catch {
		return null;
	}
}

/** Only this machine may be spoken to without TLS; a name that merely contains it may not. */
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;
const ADDRESS_SENTENCE =
	"The api-url input must be an https address, or an http one on this machine";

/** The base every path is appended to: no trailing slash, no query, no login. */
function apiBase(value: string): { base: string } | { error: string } {
	const text = value.trim();
	if (text === "") {
		return { error: "The api-url input is empty, so there is no Typelapse server to ask" };
	}
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return { error: ADDRESS_SENTENCE };
	}
	if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.test(url.hostname))) {
		return { error: ADDRESS_SENTENCE };
	}
	if (url.username !== "" || url.password !== "") {
		return { error: "The api-url input must not carry a user name or a password" };
	}
	return { base: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

/** The options the route reads, from the inputs that are set; or why none can be sent. */
function renderOptionsOf(
	input: HostedInput,
): { options: Record<string, unknown> } | { error: string } {
	const options: Record<string, unknown> = {};
	const format = input.format.trim().toLowerCase();
	if (format === "gif") {
		return { error: "Hosted renders are MP4 or WebM" };
	}
	if (format) {
		options.format = format;
	}
	const size = input.size.trim();
	if (size) {
		const edges = /^(\d+)x(\d+)$/i.exec(size);
		if (!edges) {
			return { error: `The size input takes WIDTHxHEIGHT such as 1920x1080, not '${size}'` };
		}
		options.width = Number(edges[1]);
		options.height = Number(edges[2]);
	}
	const fps = input.fps.trim();
	if (fps) {
		// A rate or a size outside the choices is the route's to refuse, in its words.
		options.fps = /^\d+$/.test(fps) ? Number(fps) : fps;
	}
	const theme = input.theme.trim();
	if (theme) {
		options.theme = theme;
	}
	return { options };
}

interface Reply {
	status: number;
	body: Record<string, unknown>;
	/** The wait a 429 asks for, when it asks. */
	retryAfterMs: number | null;
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
	try {
		const value: unknown = await response.json();
		return typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

/** The key out of anything that is about to leave: a log line, a file, an output. */
function scrubber(key: string): (text: string) => string {
	return key.length >= MIN_SCRUBBED_KEY ? (text) => text.split(key).join("***") : (text) => text;
}

/**
 * Ask Typelapse to render the source and say what came of it. Never throws and
 * never prints the key; every outcome but `rendered` leaves the runner to render.
 */
export async function renderOnTypelapse(
	input: HostedInput,
	deps: HostedDeps,
): Promise<HostedResult> {
	const key = input.apiKey.trim();
	const scrub = scrubber(key);
	const log = (line: string) => deps.log(scrub(line));
	const result = await ask(input, key, deps, log);
	return JSON.parse(scrub(JSON.stringify(result))) as HostedResult;
}

async function ask(
	input: HostedInput,
	key: string,
	deps: HostedDeps,
	log: (line: string) => void,
): Promise<HostedResult> {
	if (key === "") {
		return unavailable("The api-key input is empty, so there is no key to send");
	}
	const address = apiBase(input.apiUrl);
	if ("error" in address) {
		return unavailable(address.error);
	}
	if (!isGitHubLink(input.source)) {
		return unavailable(
			"Typelapse renders a GitHub link only, so this source is rendered on the runner",
		);
	}
	const asked = renderOptionsOf(input);
	if ("error" in asked) {
		return unavailable(asked.error);
	}
	const { base } = address;
	const unreachable = `Typelapse could not be reached at ${new URL(base).origin}`;

	async function call(method: "GET" | "POST" | "PUT", path: string, body?: unknown) {
		try {
			const response = await deps.fetch(`${base}${path}`, {
				method,
				// A redirect would carry the key to wherever it points.
				redirect: "manual",
				headers: {
					authorization: `Bearer ${key}`,
					accept: "application/json",
					...(body === undefined ? {} : { "content-type": "application/json" }),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			const retryAfter = Number(response.headers.get("retry-after"));
			const reply: Reply = {
				status: response.status,
				body: await bodyOf(response),
				retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : null,
			};
			return reply;
		} catch {
			return null;
		}
	}

	/** The server's own sentence for why it said no, or what it answered. */
	const refusal = (reply: Reply): string => {
		if (reply.status >= 300 && reply.status < 400) {
			return REDIRECTED;
		}
		const said = typeof reply.body.error === "string" ? oneSentence(reply.body.error) : "";
		return said || `Typelapse answered ${reply.status}`;
	};

	const label = oneSentence(input.source).slice(0, 80);
	log(`Asking Typelapse to render ${label}…`);
	const posted = await call("POST", "/api/cloud/render/source", {
		source: input.source,
		...(Object.keys(asked.options).length > 0 ? { renderOptions: asked.options } : {}),
	});
	if (!posted) {
		return unavailable(unreachable);
	}
	const studioUrl = webUrl(posted.body.studioUrl);
	const notice = typeof posted.body.notice === "string" ? oneSentence(posted.body.notice) : "";
	if (posted.status === 200) {
		// A free account: the route fetched and saved nothing, and says where the studio opens.
		return studioUrl
			? { outcome: "free", studioUrl, ...(notice ? { notice } : {}) }
			: unavailable(NOT_UNDERSTOOD);
	}
	if (posted.status !== 202) {
		return unavailable(refusal(posted));
	}
	const jobId = asRecord(posted.body.job).id;
	if (typeof jobId !== "string" || !/^[\w-]{1,128}$/.test(jobId) || !studioUrl) {
		return unavailable(NOT_UNDERSTOOD);
	}
	log(`Typelapse accepted the render as ${jobId}.`);

	const deadline = deps.now() + WAIT_MS;
	let delay = FIRST_POLL_MS;
	let failedPolls = 0;
	let shown = "";
	for (;;) {
		const polled = await call("GET", `/api/cloud/jobs/${jobId}`);
		let wait = delay;
		if (polled && polled.status === 200) {
			failedPolls = 0;
			const job = asRecord(polled.body.job);
			const state = typeof job.status === "string" ? job.status : "";
			if (state === "succeeded") {
				break;
			}
			if (state === "canceled") {
				return unavailable("The hosted render was canceled");
			}
			if (state === "failed") {
				const code = typeof job.errorCode === "string" && /^[\w-]{1,64}$/.test(job.errorCode);
				return unavailable(
					code ? `The hosted render failed (${job.errorCode})` : "The hosted render failed",
				);
			}
			if (state !== shown) {
				shown = state;
				log(`The render is ${state || "pending"}.`);
			}
		} else if (polled?.status === 429) {
			wait = polled.retryAfterMs ?? delay;
		} else if (polled === null || polled.status >= 500) {
			failedPolls += 1;
			if (failedPolls >= MAX_FAILED_POLLS) {
				return unavailable("Typelapse stopped answering while the render ran");
			}
		} else {
			return unavailable(refusal(polled));
		}
		const remaining = deadline - deps.now();
		if (remaining <= 0) {
			return unavailable(`The hosted render was still running after ${WAIT_MS / 60_000} minutes`);
		}
		await deps.sleep(Math.min(wait, remaining));
		delay = Math.min(Math.round(delay * POLL_GROWTH), LAST_POLL_MS);
	}

	log("The render finished; publishing its page.");
	const published = await call("PUT", `/api/cloud/jobs/${jobId}/public`, { public: true });
	if (!published) {
		return unavailable(unreachable);
	}
	if (published.status !== 200) {
		return unavailable(
			`The render finished, but its page could not be published: ${refusal(published)}`,
		);
	}
	const page = asRecord(published.body.page);
	const pageUrl = page.public === true ? webUrl(page.url) : null;
	if (!pageUrl) {
		return unavailable("The render finished, but Typelapse did not say where its page is");
	}
	log(`Published ${pageUrl}`);
	return { outcome: "rendered", jobId, pageUrl, studioUrl, ...(notice ? { notice } : {}) };
}

const FORK_NOTE =
	"This pull request comes from a fork, and GitHub gives a fork's workflow no secrets, so the API key did not arrive and the video rendered on this runner.";
const NO_KEY_NOTE =
	"The api-key input is empty, so the video rendered on this runner instead of on Typelapse.";

/** The studio's address without its link, for the CLI's --studio-url on the runner's own render. */
function studioBase(link: string): string {
	const url = new URL(link);
	return `${url.origin}${url.pathname}`;
}

/** The lines the next steps read: GITHUB_OUTPUT's `name=value`, one value on one line. */
function outputsFor(result: HostedResult): string[] {
	switch (result.outcome) {
		case "rendered":
			return ["rendered=true", `share-url=${result.pageUrl}`, `studio-url=${result.studioUrl}`];
		case "free":
			return [
				"rendered=false",
				`studio-url=${result.studioUrl}`,
				`studio-base=${studioBase(result.studioUrl)}`,
			];
		case "unavailable":
			return ["rendered=false"];
	}
}

/** A workflow command's message cannot carry a percent sign or a line break as they are. */
function warning(message: string): string {
	return `::warning title=Typelapse::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`;
}

/**
 * The Action's step: environment in, files out. Without a key it asks nothing,
 * and says why in the job summary when the workflow named a server; with one it
 * asks, and records what came of it for the steps after. It finishes whatever
 * happens, because a hosted problem is never the reason a job fails.
 */
export async function runHostedStep(
	env: Record<string, string | undefined>,
	deps: HostedDeps,
): Promise<HostedResult | null> {
	const key = (env.TYPELAPSE_API_KEY ?? "").trim();
	const apiUrl = (env.TYPELAPSE_API_URL ?? "").trim();
	const outputs = (lines: string[]) => {
		if (env.GITHUB_OUTPUT) {
			appendFileSync(env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
		}
	};
	if (key === "") {
		if (apiUrl === "") {
			return null;
		}
		// The workflow pointed the Action at a server and no key arrived: say so where its readers look.
		if (env.GITHUB_STEP_SUMMARY) {
			appendFileSync(
				env.GITHUB_STEP_SUMMARY,
				`${env.TYPELAPSE_FORK === "true" ? FORK_NOTE : NO_KEY_NOTE}\n`,
			);
		}
		outputs(["rendered=false"]);
		return null;
	}

	let result: HostedResult;
	try {
		result = await renderOnTypelapse(
			{
				apiKey: key,
				apiUrl,
				source: env.SOURCE ?? "",
				format: env.FORMAT ?? "",
				size: env.SIZE ?? "",
				fps: env.FPS ?? "",
				theme: env.THEME ?? "",
			},
			deps,
		);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		result = unavailable(
			`The hosted step stopped unexpectedly: ${oneSentence(scrubber(key)(reason))}`,
		);
	}
	if (env.TYPELAPSE_HOSTED_RESULT) {
		writeFileSync(env.TYPELAPSE_HOSTED_RESULT, `${JSON.stringify(result)}\n`);
	}
	outputs(outputsFor(result));
	if (result.outcome === "unavailable") {
		deps.log(warning(`${result.error}. The video rendered on this runner instead.`));
	}
	return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await runHostedStep(process.env, {
		fetch: globalThis.fetch,
		sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
		now: Date.now,
		log: (line) => console.log(line),
	});
}
