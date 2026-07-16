/**
 * Pure resolvers mapping a pasted GitHub URL to the coordinates of a change to
 * animate: a pull request (`{owner, repo, number}`) or a single commit
 * (`{owner, repo, sha}`). No network here — the infrastructure adapter
 * (`import/pr-import`) turns these refs into a fetched diff + title. This mirrors
 * the value-map style of the sibling `code-url` resolver.
 */

/** A pull request to walk through: repo coordinates + PR number. */
export interface PrRef {
	owner: string;
	repo: string;
	number: number;
}

/** A single commit to walk through: repo coordinates + commit sha. */
export interface CommitRef {
	owner: string;
	repo: string;
	sha: string;
}

/** Parse the input into a URL, tolerating a missing protocol; null if unparseable. */
function toUrl(input: string): URL | null {
	try {
		return new URL(input);
	} catch {
		try {
			return new URL(`https://${input}`);
		} catch {
			return null;
		}
	}
}

/** github.com host, ignoring a leading `www.`; null when it's some other host. */
function githubSegments(input: string): string[] | null {
	const url = toUrl(input.trim());
	if (!url) {
		return null;
	}
	const host = url.hostname.toLowerCase().replace(/^www\./, "");
	if (host !== "github.com") {
		return null;
	}
	return url.pathname.split("/").filter(Boolean);
}

/**
 * Resolve `github.com/{owner}/{repo}/pull/{n}` (with any trailing `/files`,
 * `/commits`, query or fragment) to a {@link PrRef}, or null when it isn't a PR
 * URL or `n` isn't numeric.
 */
export function resolvePrUrl(input: string): PrRef | null {
	const segments = githubSegments(input);
	if (!segments) {
		return null;
	}
	const [owner, repo, kind, number] = segments;
	if (!owner || !repo || kind !== "pull" || !number) {
		return null;
	}
	if (!/^\d+$/.test(number)) {
		return null;
	}
	return { owner, repo, number: Number(number) };
}

/**
 * Resolve `github.com/{owner}/{repo}/commit/{sha}` (7–40 hex chars, with any
 * trailing segment, query or fragment) to a {@link CommitRef}, or null when it
 * isn't a commit URL or the sha isn't a valid short/full hash.
 */
export function resolveCommitUrl(input: string): CommitRef | null {
	const segments = githubSegments(input);
	if (!segments) {
		return null;
	}
	const [owner, repo, kind, sha] = segments;
	if (!owner || !repo || kind !== "commit" || !sha) {
		return null;
	}
	if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
		return null;
	}
	return { owner, repo, sha };
}
