/**
 * The studio route's files, read from the page, and a way to ask the browser for
 * them early.
 *
 * `vite-plugin-studio-preload.ts` writes the list into a JSON element at build
 * time (the file names carry content hashes, so no source file can spell them).
 * A dev server writes nothing, and then there is nothing to fetch ahead: the
 * route loads the ordinary way.
 *
 * A prefetch is a hint at low priority and a failure is invisible. It goes into
 * the HTTP cache, not into the module map, so a failed hint can never turn the
 * real navigation into a failed import.
 */

/** Written by `studioPreload` in vite-plugin-studio-preload.ts, under the same id. */
export const STUDIO_CHUNKS_ELEMENT_ID = "typelapse-studio-chunks";

/** The studio's file URLs, or none when the page does not carry the list. */
export function studioChunkUrls(doc: Document = document): string[] {
	const raw = doc.getElementById(STUDIO_CHUNKS_ELEMENT_ID)?.textContent;
	if (!raw) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((url): url is string => typeof url === "string" && url.startsWith("/"))
			: [];
	} catch {
		return [];
	}
}

/** Ask the browser to fetch the studio's files at idle priority. Safe to call any number of times. */
export function prefetchStudio(doc: Document = document): void {
	for (const url of studioChunkUrls(doc)) {
		const known = [...doc.head.querySelectorAll("link")].some(
			(link) => link.getAttribute("href") === url,
		);
		if (known) {
			continue;
		}
		const link = doc.createElement("link");
		link.rel = "prefetch";
		link.setAttribute("as", url.endsWith(".css") ? "style" : "script");
		link.crossOrigin = "";
		link.href = url;
		doc.head.append(link);
	}
}
