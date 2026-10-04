/**
 * What a pasted string *is*, decided in one place.
 *
 * The studio has always been able to import a PR, a commit, a code URL and a
 * raw diff, but the decision of which one it was reading lived inside
 * `DiffImportMenu.apply()` as an ordered `if` cascade, with the code-URL arm
 * living in a different popover entirely. Nothing else could ask the question.
 * The landing hero has to ask it — you paste one thing into one field there —
 * so the cascade moves here, where it is pure, tested and shared.
 *
 * Order matters and is the whole contract: the narrow readings (a URL naming
 * exact coordinates) are tried before the wide ones (it looks like a diff),
 * and "a snippet" is what is left when nothing else claimed it.
 */

import { resolveCodeUrl } from "./code-url";
import { resolveCommitUrl, resolveCompareUrl, resolvePrUrl, resolveReleaseUrl } from "./pr-url";

/** The seven things a paste can be, plus the absence of one. */
export type SourceKind =
	| "empty"
	| "pr"
	| "commit"
	| "release"
	| "compare"
	| "code-url"
	| "diff"
	| "snippet";

/** `diff --git a/x b/x` — git's own header, the least ambiguous marker there is. */
const GIT_HEADER = /^diff --git /m;

/** `@@ -1,6 +1,10 @@`, line counts optional. Anchored, so a hunk marker quoted
    inside a string literal does not turn a snippet into a diff. */
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m;

/** A bare `---`/`+++` pair, for diffs produced without the git header. */
const FILE_PAIR = /^--- .+\n\+\+\+ .+/m;

/**
 * Whether the text carries the shape of a unified diff. Structural, not
 * semantic: it answers "was this meant to be a diff", and `diffToSnapshots` is
 * still the authority on whether the diff is usable.
 */
export function looksLikeUnifiedDiff(input: string): boolean {
	// CRLF would break the anchors and the ---/+++ pair; a diff pasted from
	// Windows or from a browser is still a diff.
	const text = input.replace(/\r\n/g, "\n");
	if (text.trim() === "") {
		return false;
	}
	return GIT_HEADER.test(text) || HUNK_HEADER.test(text) || FILE_PAIR.test(text);
}

/**
 * One token that names a web address: an http(s) scheme, `www.`, or a bare
 * code-host path. Deliberately narrow, so a one-line expression such as
 * `Math.PI/2` is still a snippet.
 */
const BARE_LINK =
	/^(?:https?:\/\/|www\.)\S+$|^(?:[a-z0-9-]+\.)*(?:github|gitlab|bitbucket)\.(?:com|org)\/\S*$/i;

/**
 * Whether a paste is a link and nothing else. A link no resolver claimed is a
 * mistyped pull request or a host Typelapse cannot read, never code: falling
 * through to "snippet" used to replace the studio with the URL as its code.
 */
export function isBareLink(input: string): boolean {
	return BARE_LINK.test(input.trim());
}

/**
 * Read a pasted string as one of the {@link SourceKind}s. Never throws and never
 * fetches: the caller decides what to do with the answer.
 */
export function classifySource(input: string): SourceKind {
	const trimmed = input.trim();
	if (trimmed === "") {
		return "empty";
	}
	if (resolvePrUrl(trimmed)) {
		return "pr";
	}
	if (resolveCommitUrl(trimmed)) {
		return "commit";
	}
	if (resolveReleaseUrl(trimmed)) {
		return "release";
	}
	if (resolveCompareUrl(trimmed)) {
		return "compare";
	}
	if (resolveCodeUrl(trimmed)) {
		return "code-url";
	}
	if (looksLikeUnifiedDiff(trimmed)) {
		return "diff";
	}
	return "snippet";
}
