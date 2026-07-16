/**
 * Pure resolver mapping a user-pasted gist / GitHub URL to a fetchable URL, plus
 * a filename → studio-language mapping. No network here — the infrastructure
 * adapter does the fetching; this stays a dependency-free, testable value map.
 */

export type CodeUrlKind = "gist-api" | "raw";

export interface ResolvedCodeUrl {
	fetchUrl: string;
	kind: CodeUrlKind;
}

/** File extension → the studio's Shiki-compatible language id. */
const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	js: "javascript",
	jsx: "javascript",
	py: "python",
	rs: "rust",
	go: "go",
	html: "html",
	css: "css",
	json: "json",
	java: "java",
	cs: "csharp",
	cpp: "cpp",
	cc: "cpp",
	php: "php",
	rb: "ruby",
	swift: "swift",
	kt: "kotlin",
	sql: "sql",
	yml: "yaml",
	yaml: "yaml",
	md: "markdown",
	sh: "shell",
};

const DEFAULT_LANGUAGE = "typescript";

/** The last path segment of a name/path, lowercased. */
function basename(name: string): string {
	return name.split("/").pop()?.toLowerCase() ?? "";
}

/** The lowercase extension of a filename (empty when there is none). */
function extension(base: string): string {
	return base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
}

/** Map a filename to a studio language id; unknown/extensionless → typescript. */
export function languageFromFilename(name: string): string {
	const base = basename(name);
	if (base === "dockerfile") {
		return "dockerfile";
	}
	const ext = extension(base);
	return Object.hasOwn(EXT_TO_LANG, ext)
		? (EXT_TO_LANG[ext] ?? DEFAULT_LANGUAGE)
		: DEFAULT_LANGUAGE;
}

/** True when the path points at a file we know how to language-tag. */
function hasCodeExtension(pathname: string): boolean {
	const base = basename(pathname);
	if (base === "dockerfile") {
		return true;
	}
	return Object.hasOwn(EXT_TO_LANG, extension(base));
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
