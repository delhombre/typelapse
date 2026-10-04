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

/** Reports fetch progress as commit `done` of `total` while chaptering a PR. */
export type ChapterProgress = (done: number, total: number) => void;

/** Abort a hung request after this many ms (per request). */
const TIMEOUT_MS = 10_000;

/** More commits than this and chaptering is unwieldy: fall back to the whole change. */
const MAX_CHAPTER_COMMITS = 30;

const DIFF_ACCEPT = "application/vnd.github.diff";
const JSON_ACCEPT = "application/vnd.github+json";

/** Map a non-OK response to a short, user-facing message. */
function errorForStatus(status: number, notFound: string): Error {
	if (status === 404) {
		// GitHub answers 404, not 403, for a repository the visitor cannot see.
		return new Error(`${notFound} (or the repository is private)`);
	}
	if (status === 403 || status === 429) {
		return new Error("GitHub rate limit hit: paste the diff instead");
	}
	if (status === 406) {
		// GitHub refuses to render very large diffs as text.
		return new Error("GitHub will not serve a diff this large: paste a smaller diff instead");
	}
	return new Error("Could not fetch the change");
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
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, { signal: controller.signal, headers: { Accept: accept } });
		if (!response.ok) {
			throw errorForStatus(response.status, notFound);
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
		throw err instanceof Error ? err : new Error("Could not fetch the change");
	} finally {
		clearTimeout(timeout);
	}
}

/** The raw unified diff for a resource; throws a mapped Error on any failure. */
function fetchDiff(url: string, notFound: string): Promise<string> {
	return requestGitHub(url, DIFF_ACCEPT, notFound, (response) => response.text());
}

/** JSON for a resource, strictly: throws a mapped Error on any failure. */
function fetchJsonStrict<T>(url: string, notFound: string): Promise<T> {
	return requestGitHub(url, JSON_ACCEPT, notFound, (response) => response.json() as Promise<T>);
}

/**
 * JSON for a resource, or null on any failure. A missing title must never fail an
 * otherwise-good import, so this swallows errors and non-OK responses and lets the
 * caller fall back.
 */
async function fetchJson<T>(url: string): Promise<T | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: JSON_ACCEPT },
		});
		if (!response.ok) {
			return null;
		}
		return (await response.json()) as T;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/** The api.github.com URL for a pull request's top-level resource. */
function prApiUrl(ref: PrRef): string {
	return `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
}

/** The api.github.com URL for a single commit's resource. */
function commitApiUrl(owner: string, repo: string, sha: string): string {
	return `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
}

/** The PR's title, degrading to `#<number>` when its own fetch fails. */
async function fetchPrTitle(ref: PrRef): Promise<string> {
	const json = await fetchJson<{ title?: string }>(prApiUrl(ref));
	return json?.title?.trim() || `#${ref.number}`;
}

/**
 * A pull request → its diff + title. The diff and the title are fetched in
 * parallel; the diff decides success while the title degrades to `#<number>` if
 * its own fetch fails.
 */
export async function fetchPrWalkthrough(ref: PrRef): Promise<Walkthrough> {
	const [diffText, title] = await Promise.all([
		fetchDiff(prApiUrl(ref), "PR not found").then(requireChanges),
		fetchPrTitle(ref),
	]);
	return { diffText, title };
}

/**
 * A single commit → its diff + title. Same shape as {@link fetchPrWalkthrough};
 * the title is the commit message's first line, falling back to the short sha.
 */
export async function fetchCommitDiff(ref: CommitRef): Promise<Walkthrough> {
	const url = commitApiUrl(ref.owner, ref.repo, ref.sha);
	const [diffText, json] = await Promise.all([
		fetchDiff(url, "Commit not found").then(requireChanges),
		fetchJson<{ commit?: { message?: string } }>(url),
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
	if (err instanceof Error && err.message.startsWith("GitHub rate limit")) {
		return new Error("GitHub rate limit hit: import the whole change instead");
	}
	return err instanceof Error ? err : new Error("Could not fetch the change");
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
): Promise<ChapteredWalkthrough> {
	try {
		const commits = await fetchJsonStrict<PrCommit[]>(`${prApiUrl(ref)}/commits`, "PR not found");
		if (commits.length === 0) {
			throw new Error("This PR has no commits to chapter");
		}
		if (commits.length > MAX_CHAPTER_COMMITS) {
			throw new Error(`This PR has ${commits.length} commits: import the whole change instead`);
		}

		const title = await fetchPrTitle(ref);
		const chapters: DiffChapter[] = [];
		for (const commit of commits) {
			const diffText = await fetchDiff(
				commitApiUrl(ref.owner, ref.repo, commit.sha),
				"Commit not found",
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
