/**
 * Fetch code from a gist / GitHub / raw URL and shape it for the studio.
 * Uses only the browser fetch: GitHub's API and raw hosts send permissive CORS
 * headers, so no token or proxy is needed. Pure URL logic lives in the
 * application layer (`code-url.ts`); this adapter just does IO + parsing.
 */

import { resolveCodeUrl } from "@/application/import/code-url";
import { languageFromFilename } from "@/application/language/language-from-filename";

export interface ImportedCode {
	code: string;
	language: string;
	title: string;
}

/** Abort a hung request after this many ms. */
const TIMEOUT_MS = 10_000;

interface GistFile {
	filename?: string;
	content?: string;
}

interface GistResponse {
	files?: Record<string, GistFile | null>;
}

/** Take the first file (name + content) out of a gist API response. */
function firstGistFile(data: GistResponse): GistFile | null {
	const files = data.files ? Object.values(data.files) : [];
	for (const file of files) {
		if (file?.content) {
			return file;
		}
	}
	return null;
}

/** Filename from a raw URL path (fragment/query stripped). */
function filenameFromUrl(url: string): string {
	const last = url.split("/").pop()?.split(/[?#]/)[0];
	return last && last.length > 0 ? last : "snippet.txt";
}

export async function importCodeFromUrl(input: string): Promise<ImportedCode> {
	const resolved = resolveCodeUrl(input);
	if (!resolved) {
		throw new Error("Unsupported URL: paste a gist or GitHub file link");
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const headers =
			resolved.kind === "gist-api" ? { Accept: "application/vnd.github+json" } : undefined;
		const response = await fetch(resolved.fetchUrl, { signal: controller.signal, headers });
		if (!response.ok) {
			throw new Error(`Could not fetch (HTTP ${response.status})`);
		}

		if (resolved.kind === "gist-api") {
			const data = (await response.json()) as GistResponse;
			const file = firstGistFile(data);
			if (!file?.content) {
				throw new Error("That gist has no readable files");
			}
			const title = file.filename ?? "gist.txt";
			return { code: file.content, language: languageFromFilename(title), title };
		}

		const code = await response.text();
		const title = filenameFromUrl(resolved.fetchUrl);
		return { code, language: languageFromFilename(title), title };
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error("Request timed out");
		}
		throw err instanceof Error ? err : new Error("Import failed");
	} finally {
		clearTimeout(timeout);
	}
}
