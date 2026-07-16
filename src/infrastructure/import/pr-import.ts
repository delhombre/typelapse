/**
 * Fetch a whole change — a GitHub pull request or a single commit — as raw
 * unified-diff text plus a human title, ready to hand to `importDiff`. Uses only
 * the browser fetch: api.github.com sends permissive CORS headers and serves the
 * raw diff when asked with `Accept: application/vnd.github.diff`, so no token or
 * proxy is needed. Pure URL parsing lives in `application/import/pr-url`.
 */

import type { CommitRef, PrRef } from "@/application/import/pr-url";

export interface Walkthrough {
	diffText: string;
	title: string;
}

/** Abort a hung request after this many ms (per request). */
const TIMEOUT_MS = 10_000;

/** Map a non-OK diff response to a short, user-facing message. */
function errorForStatus(status: number, notFound: string): Error {
	if (status === 404) {
		return new Error(notFound);
	}
	if (status === 403 || status === 429) {
		return new Error("GitHub rate limit hit — paste the diff instead");
	}
	return new Error("Could not fetch the change");
}

/**
 * Fetch the raw unified diff for a GitHub API resource. Throws a mapped,
 * user-facing Error on any failure — a bad diff fetch fails the whole import.
 */
async function fetchDiff(url: string, notFound: string): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/vnd.github.diff" },
		});
		if (!response.ok) {
			throw errorForStatus(response.status, notFound);
		}
		return await response.text();
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error("Request timed out");
		}
		throw err instanceof Error ? err : new Error("Could not fetch the change");
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Fetch the JSON metadata for a GitHub API resource, or null on any failure. A
 * missing title must never fail an otherwise-good import, so this swallows
 * errors and non-OK responses and lets the caller fall back.
 */
async function fetchJson<T>(url: string): Promise<T | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/vnd.github+json" },
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

/**
 * A pull request → its diff + title. The diff and the title JSON are fetched in
 * parallel; the diff decides success while the title degrades to `#<number>` if
 * its own fetch fails.
 *
 * Future palier: a PR is a stack of commits, so a richer walkthrough could fetch
 * `/pulls/{n}/commits` and chapter the animation one segment per commit. Out of
 * scope here — for now the PR animates as a single squashed change.
 */
export async function fetchPrWalkthrough(ref: PrRef): Promise<Walkthrough> {
	const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`;
	const [diffText, json] = await Promise.all([
		fetchDiff(url, "PR not found"),
		fetchJson<{ title?: string }>(url),
	]);
	const title = json?.title?.trim() || `#${ref.number}`;
	return { diffText, title };
}

/**
 * A single commit → its diff + title. Same shape as {@link fetchPrWalkthrough};
 * the title is the commit message's first line, falling back to the short sha.
 */
export async function fetchCommitDiff(ref: CommitRef): Promise<Walkthrough> {
	const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits/${ref.sha}`;
	const [diffText, json] = await Promise.all([
		fetchDiff(url, "Commit not found"),
		fetchJson<{ commit?: { message?: string } }>(url),
	]);
	const firstLine = json?.commit?.message?.split("\n")[0]?.trim();
	return { diffText, title: firstLine || ref.sha.slice(0, 7) };
}
