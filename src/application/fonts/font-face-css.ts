/**
 * `@font-face` blocks, read out of a stylesheet.
 *
 * A document loads a Google font by dropping a `<link>` in the head and letting
 * the CSS engine do the rest. A worker has no CSS engine, so the same stylesheet
 * has to be fetched as text and turned into `FontFace` objects by hand — which
 * means someone has to find the actual font file inside it.
 *
 * This is deliberately a small, tolerant reader rather than a CSS parser: it
 * knows the shape Google serves (one block per unicode subset, one `src`, one
 * `unicode-range`) and returns nothing at all for anything it does not
 * recognise, because a face it invents is worse than a face it misses.
 */

export interface FontFaceSource {
	family: string;
	url: string;
	weight?: string;
	style?: string;
	unicodeRange?: string;
}

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
 * Google serves one format to a modern browser, but the list is allowed to
 * carry several and the compressed one is always the one to take.
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

/**
 * The reader's inverse: faces written out as `@font-face` rules, for a scope
 * that registers fonts through a stylesheet (the document, the server
 * composition). `resolveUrl` lets a bundle point a face at its own copy of the
 * file; the document serves them at the path the registry names.
 */
export function fontFaceRules(
	faces: readonly FontFaceSource[],
	resolveUrl: (url: string) => string = (url) => url,
): string {
	return faces
		.map((face) => {
			const lines = [
				`font-family: "${face.family}";`,
				`src: url("${resolveUrl(face.url)}") format("woff2");`,
				face.weight ? `font-weight: ${face.weight};` : "",
				face.style ? `font-style: ${face.style};` : "",
				"font-display: swap;",
				face.unicodeRange ? `unicode-range: ${face.unicodeRange};` : "",
			].filter((line) => line !== "");
			return `@font-face {\n\t${lines.join("\n\t")}\n}`;
		})
		.join("\n");
}
