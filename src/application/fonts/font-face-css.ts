/**
 * `@font-face` rules, written out from the registry's faces, for a scope that
 * registers fonts through a stylesheet (the document, the server composition).
 */

export interface FontFaceSource {
	family: string;
	url: string;
	weight?: string;
	style?: string;
	unicodeRange?: string;
}

/**
 * Faces written out as `@font-face` rules. `resolveUrl` lets a bundle point a
 * face at its own copy of the file; the document serves them at the path the
 * registry names.
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
