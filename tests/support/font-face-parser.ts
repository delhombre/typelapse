/**
 * Reads `@font-face` blocks back out of a stylesheet, so a test can assert on
 * the faces `fontFaceRules` wrote rather than on its exact text.
 *
 * A small, tolerant reader rather than a CSS parser: one block per face, one
 * `src`, one `unicode-range`, and nothing at all for anything it does not
 * recognise, because a face it invents is worse than a face it misses.
 */

import type { FontFaceSource } from "@/application/fonts/font-face-css";

const BLOCK = /@font-face\s*\{([^}]*)\}/gi;

export function parseFontFaceSources(css: string): FontFaceSource[] {
	const faces: FontFaceSource[] = [];
	for (const match of css.matchAll(BLOCK)) {
		const body = match[1] ?? "";
		const family = declaration(body, "font-family");
		const url = pickUrl(declaration(body, "src"));
		if (!family || !url) {
			continue;
		}
		faces.push({
			family: family.replace(/^["']|["']$/g, ""),
			url,
			weight: declaration(body, "font-weight"),
			style: declaration(body, "font-style"),
			unicodeRange: declaration(body, "unicode-range"),
		});
	}
	return faces;
}

function declaration(body: string, property: string): string | undefined {
	const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i").exec(body);
	return match?.[1]?.trim();
}

/**
 * The woff2 out of an `src` list, or the first URL when none says woff2.
 *
 * A list is allowed to carry several formats, and the compressed one is always
 * the one to take.
 */
function pickUrl(src: string | undefined): string | null {
	if (!src) {
		return null;
	}
	const entries = [...src.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)(\s*format\(([^)]*)\))?/gi)].map(
		(match) => ({ url: (match[2] ?? "").trim(), format: (match[4] ?? "").toLowerCase() }),
	);
	if (entries.length === 0) {
		return null;
	}
	const woff2 = entries.find((entry) => entry.format.includes("woff2"));
	return (woff2 ?? entries[0])?.url ?? null;
}
