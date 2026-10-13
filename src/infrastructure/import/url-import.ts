/**
 * Fetch code from a gist / GitHub / raw URL and shape it for the studio.
 * Uses only the browser fetch: GitHub's API and raw hosts send permissive CORS
 * headers, so no token or proxy is needed. Pure URL logic lives in the
 * application layer (`code-url.ts`); this adapter just does IO + parsing.
 */

import { resolveCodeUrl } from "@/application/import/code-url";
import { codeUrlFailure } from "@/application/import/code-url-failure";
import { languageFromFilename } from "@/application/language/language-from-filename";

export interface ImportedCode {
	code: string;
	language: string;
	title: string;
}

/** Abort a hung request after this many ms. */
const TIMEOUT_MS = 10_000;

/** Cap the response read into memory so a huge gist cannot OOM the tab. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const TOO_LARGE = "That file is too large to import (over 2 MB)";

/**
 * Read a response body into text, bounded at `maxBytes`. Rejects up front on a
 * declared Content-Length over the cap, then streams and aborts the moment the
 * accumulated bytes exceed it, so an unbounded (chunked) response cannot OOM the
 * tab. Falls back to a bounded `text()` when the body is not streamable.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) {
		throw new Error(TOO_LARGE);
	}
	const body = response.body;
	if (!body) {
		const text = await response.text();
		if (text.length > maxBytes) {
			throw new Error(TOO_LARGE);
		}
		return text;
	}
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let text = "";
	let total = 0;
	let chunk = await reader.read();
	while (!chunk.done) {
		total += chunk.value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error(TOO_LARGE);
		}
		text += decoder.decode(chunk.value, { stream: true });
		chunk = await reader.read();
	}
	text += decoder.decode();
	return text;
}

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
			throw new Error(codeUrlFailure(response.status, resolved.kind));
		}

		const payload = await readCapped(response, MAX_IMPORT_BYTES);

		if (resolved.kind === "gist-api") {
			const data = JSON.parse(payload) as GistResponse;
			const file = firstGistFile(data);
			if (!file?.content) {
				throw new Error("That gist has no readable files");
			}
			const title = file.filename ?? "gist.txt";
			return { code: file.content, language: languageFromFilename(title), title };
		}

		const code = payload;
		const title = filenameFromUrl(resolved.fetchUrl);
		return { code, language: languageFromFilename(title), title };
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			throw new Error("Request timed out");
		}
		// fetch rejects with a bare TypeError when the network or CORS fails: the browser's
		// wording ("Failed to fetch") means nothing to the user.
		if (err instanceof TypeError) {
			throw new Error("Could not reach GitHub: check your connection, or paste the code instead");
		}
		throw err instanceof Error ? err : new Error("Import failed");
	} finally {
		clearTimeout(timeout);
	}
}
