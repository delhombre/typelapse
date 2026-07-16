/**
 * Pure resolver mapping a user-pasted gist / GitHub URL to a fetchable URL. No
 * network here — the infrastructure adapter does the fetching; this stays a
 * dependency-free, testable value map. The filename → language mapping lives in
 * the shared `language/language-from-filename` module (used by diff import too).
 */

import { hasCodeExtension } from "@/application/language/language-from-filename";

export type CodeUrlKind = "gist-api" | "raw";

export interface ResolvedCodeUrl {
	fetchUrl: string;
	kind: CodeUrlKind;
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

/**
 * Resolve a gist / GitHub / raw URL to something fetchable, or null when it is
 * not a supported code URL.
 */
export function resolveCodeUrl(input: string): ResolvedCodeUrl | null {
	const trimmed = input.trim();
	if (!trimmed) {
		return null;
	}
	const url = toUrl(trimmed);
	if (!url) {
		return null;
	}
	const host = url.hostname.toLowerCase();
	const segments = url.pathname.split("/").filter(Boolean);

	// gist.github.com/<user>/<id> → the gist API.
	if (host === "gist.github.com") {
		const gistId = segments.length >= 2 ? segments[1] : segments[0];
		if (!gistId) {
			return null;
		}
		return { fetchUrl: `https://api.github.com/gists/${gistId}`, kind: "gist-api" };
	}

	// github.com/<owner>/<repo>/blob/<ref>/<path...> → raw.githubusercontent.com.
	if (host === "github.com") {
		const [owner, repo, blob, ref, ...rest] = segments;
		if (owner && repo && blob === "blob" && ref && rest.length > 0) {
			const path = rest.join("/");
			return {
				fetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
				kind: "raw",
			};
		}
		return null;
	}

	// Already-raw hosts fetch as-is.
	if (host === "raw.githubusercontent.com" || host === "gist.githubusercontent.com") {
		return { fetchUrl: url.toString(), kind: "raw" };
	}

	// Any other https URL that clearly points at a code file.
	if (url.protocol === "https:" && hasCodeExtension(url.pathname)) {
		return { fetchUrl: url.toString(), kind: "raw" };
	}

	return null;
}
