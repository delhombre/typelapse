/**
 * Fetch a whole change (a GitHub pull request or a single commit) as raw
 * unified-diff text plus a human title, ready to hand to `importDiff`. Uses only
 * the browser fetch: api.github.com sends permissive CORS headers and serves the
 * raw diff when asked with `Accept: application/vnd.github.diff`, so no token or
 * proxy is needed. Pure URL parsing lives in `application/import/pr-url`.
 *
 * A PR is a stack of commits, so `fetchPrChapters` offers a richer walkthrough:
 * one chapter per commit (each its own windowed staged sequence), concatenated by
 * the pure `chapterSnapshots` engine. `fetchPrWalkthrough` keeps the simpler path,
 * animating the PR as a single squashed change.
 */

import type { DiffChapter } from "@/application/diff";
import type { CommitRef, PrRef } from "@/application/import/pr-url";

export interface Walkthrough {
	diffText: string;
	title: string;
}

/** A PR split into one chapter per commit, plus the PR's own title. */
export interface ChapteredWalkthrough {
	title: string;
	chapters: DiffChapter[];
}

/**
 * How one read reaches GitHub, when it is not the plain anonymous one. A token
 * signs every request, which lifts the anonymous limit (60 an hour for an
 * address); a signal stops the read, whichever request it is waiting on. The
 * studio and the CLI pass none, and send what they always sent.
 */
export interface GitHubRead {
	readonly token?: string;
	readonly signal?: AbortSignal;
}

/**
 * GitHub's own limit, as a sentence a caller can act on: what the limit is, how
 * much is left and when it resets, or the wait a secondary limit asks for. Said
 * in the error, so a person who hit it knows whether to wait an hour or a minute.
 */
export class RateLimitError extends Error {
	constructor(
		readonly detail: string | undefined,
		advice: string,
	) {
		super(`GitHub rate limit hit${detail ? ` (${detail})` : ""}: ${advice}`);
		this.name = "RateLimitError";
	}

	/** The same limit, with another way out. */
	withAdvice(advice: string): RateLimitError {
		return new RateLimitError(this.detail, advice);
	}
}

/** What the rate-limit headers of a response say, in the order of what a caller needs. */
function rateLimitDetail(headers: Headers): string | undefined {
	const number = (name: string) => {
		const value = headers.get(name);
		return value !== null && value.trim() !== "" && Number.isFinite(Number(value))
			? Number(value)
			: null;
	};
	const limit = number("x-ratelimit-limit");
	const remaining = number("x-ratelimit-remaining");
	const reset = number("x-ratelimit-reset");
	const retryAfter = number("retry-after");
	// The wait GitHub asked for outranks a quota it still has: a secondary limit answers 403
	// with requests left, and "4210 of 5000 left" would hide that it is a wait.
	if (retryAfter !== null) {
		return `retry after ${retryAfter} seconds`;
	}
	const parts: string[] = [];
	if (limit !== null && remaining !== null) {
		parts.push(`${remaining} of ${limit} requests left`);
	}
	if (reset !== null && remaining === 0) {
		parts.push(`resets at ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC`);
	}
	return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Reports fetch progress as commit `done` of `total` while chaptering a PR. */
export type ChapterProgress = (done: number, total: number) => void;

/** Abort a hung request after this many ms (per request). */
const TIMEOUT_MS = 10_000;

/** More commits than this and chaptering is unwieldy: fall back to the whole change. */
export const MAX_CHAPTER_COMMITS = 30;

/** GitHub failed, or answered with nothing the importer maps: a pasted diff is the way round, for every import kind. */
const COULD_NOT_FETCH = "Could not fetch the change: paste the diff instead";

const DIFF_ACCEPT = "application/vnd.github.diff";
const JSON_ACCEPT = "application/vnd.github+json";

/**
 * The answers GitHub gives a compare it will not compute: 406 for a diff too
 * big to render, 422 or a 5xx when generating it timed out.
 */
const TOO_LARGE_STATUSES = new Set([406, 422, 500, 502, 504]);

/**
 * Map a non-OK response to a short, user-facing message. `tooLarge` replaces
 * the generic failure for the statuses GitHub uses when a range is too big.
 */
function errorForStatus(
	status: number,
	notFound: string,
	headers: Headers,
	tooLarge?: string,
): Error {
	if (tooLarge && TOO_LARGE_STATUSES.has(status)) {
		return new Error(tooLarge);
	}
	if (status === 404) {
		// GitHub answers 404, not 403, for a repository the visitor cannot see.
		return new Error(`${notFound} (or the repository is private)`);
	}
	if (status === 403 || status === 429) {
		return new RateLimitError(rateLimitDetail(headers), "paste the diff instead");
	}
	if (status === 406) {
		// GitHub refuses to render very large diffs as text.
		return new Error("GitHub will not serve a diff this large: paste a smaller diff instead");
	}
	return new Error(COULD_NOT_FETCH);
}

/**
 * A 200 with an empty body is a real answer: a merge commit, or a pull request
 * whose commits cancel out. Said here, because the diff parser would otherwise
 * ask the user to "paste a diff first" after they pasted a link. Chapter mode
 * does not use it: an empty commit there is one skipped chapter, not a failure.
 */
function requireChanges(diffText: string): string {
	if (diffText.trim() === "") {
		throw new Error("This change has no file differences to animate");
	}
	return diffText;
}

/**
 * Fetch a GitHub API resource under a per-request timeout, parse its body, and
 * throw a mapped, user-facing Error on any failure. The body is read inside the
 * timeout so a stalled download aborts too.
 */
async function requestGitHub<T>(
	url: string,
	accept: string,
	notFound: string,
	parse: (response: Response) => Promise<T>,
	tooLarge?: string,
	read: GitHubRead = {},
): Promise<T> {
	const { controller, release } = requestControl(read);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: requestHeaders(accept, read),
		});
		if (!response.ok) {
			throw errorForStatus(response.status, notFound, response.headers, tooLarge);
		}
		return await parse(response);
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error("Request timed out");
		}
		// fetch rejects with a bare TypeError ("Failed to fetch") when the network
		// or CORS fails: the browser's wording means nothing to the user.
		if (err instanceof TypeError) {
			throw new Error("Could not reach GitHub: check your connection, or paste the diff instead");
		}
		throw err instanceof Error ? err : new Error(COULD_NOT_FETCH);
	} finally {
		release();
	}
}

/**
 * The abort control of one request: it fires after {@link TIMEOUT_MS}, and when
 * the read's own signal fires, which is how a read as a whole is stopped.
 * `release` clears both once the request is over.
 */
function requestControl(read: GitHubRead): { controller: AbortController; release: () => void } {
	const controller = new AbortController();
	const stop = () => controller.abort();
	const timeout = setTimeout(stop, TIMEOUT_MS);
	if (read.signal?.aborted) {
		stop();
	}
	read.signal?.addEventListener("abort", stop, { once: true });
	return {
		controller,
		release: () => {
			clearTimeout(timeout);
			read.signal?.removeEventListener("abort", stop);
		},
	};
}

/** What every request says: what it accepts, and who it is when the read has a token. */
function requestHeaders(accept: string, read: GitHubRead): Record<string, string> {
	return read.token
		? { Accept: accept, Authorization: `Bearer ${read.token}` }
		: { Accept: accept };
}

/** The raw unified diff for a resource; throws a mapped Error on any failure. */
export function fetchDiff(
	url: string,
	notFound: string,
	tooLarge?: string,
	read?: GitHubRead,
): Promise<string> {
	return requestGitHub(url, DIFF_ACCEPT, notFound, (response) => response.text(), tooLarge, read);
}

/** JSON for a resource, strictly: throws a mapped Error on any failure. */
export function fetchJsonStrict<T>(
	url: string,
	notFound: string,
	tooLarge?: string,
	read?: GitHubRead,
): Promise<T> {
	return requestGitHub(
		url,
		JSON_ACCEPT,
		notFound,
		(response) => response.json() as Promise<T>,
		tooLarge,
		read,
	);
}

/**
 * JSON for a resource, or null on any failure. A missing title must never fail an
 * otherwise-good import, so this swallows errors and non-OK responses and lets the
 * caller fall back.
 */
export async function fetchJson<T>(url: string, read: GitHubRead = {}): Promise<T | null> {
	const { controller, release } = requestControl(read);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: requestHeaders(JSON_ACCEPT, read),
		});
		if (!response.ok) {
			return null;
		}
		return (await response.json()) as T;
	} catch {
		return null;
	} finally {
		release();
	}
}

/** The api.github.com URL for a pull request's top-level resource. */
function prApiUrl(ref: PrRef): string {
	return `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
}

/** The api.github.com URL for a single commit's resource. */
export function commitApiUrl(owner: string, repo: string, sha: string): string {
	return `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
}

/** The PR's title, degrading to `#<number>` when its own fetch fails. */
async function fetchPrTitle(ref: PrRef, read?: GitHubRead): Promise<string> {
	const json = await fetchJson<{ title?: string }>(prApiUrl(ref), read);
	return json?.title?.trim() || `#${ref.number}`;
}

/**
 * A pull request → its diff + title. The diff and the title are fetched in
 * parallel; the diff decides success while the title degrades to `#<number>` if
 * its own fetch fails.
 */
export async function fetchPrWalkthrough(ref: PrRef, read?: GitHubRead): Promise<Walkthrough> {
	const [diffText, title] = await Promise.all([
		fetchDiff(prApiUrl(ref), "PR not found", undefined, read).then(requireChanges),
		fetchPrTitle(ref, read),
	]);
	return { diffText, title };
}

/**
 * A single commit → its diff + title. Same shape as {@link fetchPrWalkthrough};
 * the title is the commit message's first line, falling back to the short sha.
 */
export async function fetchCommitDiff(ref: CommitRef, read?: GitHubRead): Promise<Walkthrough> {
	const url = commitApiUrl(ref.owner, ref.repo, ref.sha);
	const [diffText, json] = await Promise.all([
		fetchDiff(url, "Commit not found", undefined, read).then(requireChanges),
		fetchJson<{ commit?: { message?: string } }>(url, read),
	]);
	const firstLine = json?.commit?.message?.split("\n")[0]?.trim();
	return { diffText, title: firstLine || ref.sha.slice(0, 7) };
}

/** One commit as the GitHub commits API returns it: its sha and message. */
interface PrCommit {
	sha: string;
	commit?: { message?: string };
}

/** Rewrite a rate-limit error so chapter mode points at the cheaper whole-change path. */
function chapterError(err: unknown): Error {
	if (err instanceof RateLimitError) {
		return err.withAdvice("import the whole change instead");
	}
	return err instanceof Error ? err : new Error(COULD_NOT_FETCH);
}

/**
 * A pull request → one chapter per commit, in order, plus the PR title. The
 * commit list is fetched first (order-preserving, ≤250 from the API), then each
 * commit's diff SEQUENTIALLY, which is gentler on the rate limit than a burst and
 * lets `onProgress` report `commit k/N`. Beyond {@link MAX_CHAPTER_COMMITS} commits
 * the walkthrough would be unwieldy, so we throw and steer to the whole change.
 *
 * The chapter subject is each commit message's first line. Rate-limit failures
 * rethrow with a hint to use the (single-request) whole-change import instead.
 */
export async function fetchPrChapters(
	ref: PrRef,
	onProgress?: ChapterProgress,
	read?: GitHubRead,
): Promise<ChapteredWalkthrough> {
	try {
		const commits = await fetchJsonStrict<PrCommit[]>(
			`${prApiUrl(ref)}/commits`,
			"PR not found",
			undefined,
			read,
		);
		if (commits.length === 0) {
			throw new Error("This PR has no commits to chapter");
		}
		if (commits.length > MAX_CHAPTER_COMMITS) {
			throw new Error(`This PR has ${commits.length} commits: import the whole change instead`);
		}

		const title = await fetchPrTitle(ref, read);
		const chapters: DiffChapter[] = [];
		for (const commit of commits) {
			const diffText = await fetchDiff(
				commitApiUrl(ref.owner, ref.repo, commit.sha),
				"Commit not found",
				undefined,
				read,
			);
			const subject = commit.commit?.message?.split("\n")[0]?.trim();
			chapters.push({ title: subject || commit.sha.slice(0, 7), diffText });
			onProgress?.(chapters.length, commits.length);
		}
		return { title, chapters };
	} catch (err) {
		throw chapterError(err);
	}
}
