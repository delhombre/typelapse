/**
 * Pure resolvers mapping a pasted GitHub URL to the coordinates of a change to
 * animate: a pull request (`{owner, repo, number}`), a single commit
 * (`{owner, repo, sha}`), a release (`{owner, repo, tag}`) or a compare range
 * (`{owner, repo, base, head}`). No network here: the infrastructure adapter
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
 * Resolve `github.com/{owner}/{repo}/commit/{sha}` (7 to 40 hex chars, with any
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

/** A GitHub release, or a bare tag shown on the release page: repo coordinates + tag. */
export interface ReleaseRef {
	owner: string;
	repo: string;
	tag: string;
}

/** A range between two refs (tags, branches or shas), as a compare page names it. */
export interface CompareRef {
	owner: string;
	repo: string;
	base: string;
	head: string;
}

/** A path segment as GitHub means it: `v1.0%2Bbuild` is the tag `v1.0+build`. */
function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/**
 * Resolve `github.com/{owner}/{repo}/releases/tag/{tag}` (the page a release
 * event's `html_url` points at) to a {@link ReleaseRef}. A tag may hold a slash
 * (`release/2.0`), so everything after `tag/` is the tag. The releases list and
 * the `latest` alias name no tag and resolve to null.
 */
export function resolveReleaseUrl(input: string): ReleaseRef | null {
	const segments = githubSegments(input);
	if (!segments) {
		return null;
	}
	const [owner, repo, kind, sub, ...rest] = segments;
	if (!owner || !repo || kind !== "releases" || sub !== "tag" || rest.length === 0) {
		return null;
	}
	return { owner, repo, tag: rest.map(decodeSegment).join("/") };
}

/**
 * Resolve `github.com/{owner}/{repo}/compare/{base}...{head}` (or the two-dot
 * form) to a {@link CompareRef}. Both sides are required: a compare against the
 * default branch alone names no range a release could be.
 */
export function resolveCompareUrl(input: string): CompareRef | null {
	const segments = githubSegments(input);
	if (!segments) {
		return null;
	}
	const [owner, repo, kind, ...rest] = segments;
	if (!owner || !repo || kind !== "compare" || rest.length === 0) {
		return null;
	}
	const range = rest.map(decodeSegment).join("/");
	const separator = range.includes("...") ? "..." : "..";
	const at = range.indexOf(separator);
	const base = range.slice(0, at);
	const head = range.slice(at + separator.length);
	if (at <= 0 || head === "") {
		return null;
	}
	return { owner, repo, base, head };
}
