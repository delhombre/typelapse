import {
	FONT_PRESETS,
	LOADABLE_FONTS,
	fontsToLoad,
	googleFontCssUrl,
	primaryFamily,
} from "@/application/fonts/code-fonts";
import { parseFontFaceSources } from "@/application/fonts/font-face-css";
import {
	MAX_ADVANCE_DRIFT,
	advanceDriftMessage,
	unresolvedFontMessage,
} from "@/application/fonts/font-fidelity";
import { describe, expect, it } from "vitest";

describe("FONT_PRESETS", () => {
	it("offers the five families the settings panel has always offered", () => {
		expect(FONT_PRESETS.map((font) => font.label)).toEqual([
			"JetBrains",
			"Fira",
			"Source",
			"IBM",
			"Cascadia",
		]);
	});

	it("gives every preset somewhere to actually be fetched from", () => {
		// The whole point: a preset with no resolvable URL is a preset the worker
		// silently substitutes a fallback for.
		for (const font of LOADABLE_FONTS) {
			expect(Boolean(font.google || font.url), font.family).toBe(true);
		}
	});

	it("keeps the stack a theme stores in step with the family it names", () => {
		for (const font of LOADABLE_FONTS) {
			expect(primaryFamily(font.stack), font.label).toBe(font.family);
		}
	});

	it("knows the self-hosted family no picker shows", () => {
		// Ioskeley Mono is the app's own mono; a theme can carry it even though
		// the picker does not offer it, so the worker still has to be able to load it.
		const ioskeley = LOADABLE_FONTS.find((font) => font.family === "Ioskeley Mono");
		expect(ioskeley?.url).toBe("/fonts/IoskeleyMono-Regular.woff2");
		expect(FONT_PRESETS).not.toContain(ioskeley);
	});
});

describe("primaryFamily", () => {
	it("takes the first family in a stack, unquoted", () => {
		expect(primaryFamily("'JetBrains Mono', ui-monospace, monospace")).toBe("JetBrains Mono");
		expect(primaryFamily('"Fira Code", monospace')).toBe("Fira Code");
		expect(primaryFamily("monospace")).toBe("monospace");
	});
});

describe("fontsToLoad", () => {
	it("picks out every family in a stack the app can fetch", () => {
		expect(fontsToLoad("Fira Code, monospace").map((font) => font.family)).toEqual(["Fira Code"]);
	});

	it("ignores generic and system families, which resolve on their own", () => {
		// `monospace` and `ui-monospace` need no loading in any scope, so their
		// absence from the registry must not be read as a failure.
		expect(fontsToLoad("ui-monospace, SFMono-Regular, Menlo, monospace")).toEqual([]);
	});

	it("reads more than one stack at a time, without repeating a family", () => {
		const families = fontsToLoad(
			"JetBrains Mono, monospace",
			"'JetBrains Mono', ui-monospace, Menlo, monospace",
			"Cascadia Code, monospace",
		).map((font) => font.family);
		expect(families).toEqual(["JetBrains Mono", "Cascadia Code"]);
	});
});

describe("googleFontCssUrl", () => {
	it("asks for the same weights the settings panel and the composition do", () => {
		expect(googleFontCssUrl("Fira+Code")).toBe(
			"https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;700&display=swap",
		);
	});
});

/** One subset block, exactly as Google serves it to a modern browser. */
const GOOGLE_CSS = `
/* cyrillic-ext */
@font-face {
  font-family: 'Fira Code';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/firacode/v22/cyrillic.woff2) format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C88;
}
/* latin */
@font-face {
  font-family: 'Fira Code';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/firacode/v22/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`;

describe("parseFontFaceSources", () => {
	it("finds every face in a Google stylesheet", () => {
		const faces = parseFontFaceSources(GOOGLE_CSS);
		expect(faces).toHaveLength(2);
		expect(faces[0]).toEqual({
			family: "Fira Code",
			url: "https://fonts.gstatic.com/s/firacode/v22/cyrillic.woff2",
			weight: "400",
			style: "normal",
			unicodeRange: "U+0460-052F, U+1C80-1C88",
		});
	});

	it("keeps the weight of each face, so a bold prompt is not synthesised", () => {
		expect(parseFontFaceSources(GOOGLE_CSS)[1]?.weight).toBe("700");
	});

	it("reads a quoted url and a bare one alike", () => {
		const css = `@font-face { font-family: "X"; src: url("https://e.example/x.woff2") format('woff2'); }`;
		expect(parseFontFaceSources(css)[0]?.url).toBe("https://e.example/x.woff2");
	});

	it("takes the woff2 source when a face offers several", () => {
		const css = `@font-face { font-family: X; src: url(a.woff) format('woff'), url(b.woff2) format('woff2'); }`;
		expect(parseFontFaceSources(css)[0]?.url).toBe("b.woff2");
	});

	it("returns nothing rather than throwing on a stylesheet it cannot read", () => {
		expect(parseFontFaceSources("")).toEqual([]);
		expect(parseFontFaceSources("body { color: red }")).toEqual([]);
	});
});

describe("unresolvedFontMessage", () => {
	it("says nothing when every family the frame needs was registered", () => {
		expect(unresolvedFontMessage([])).toBeNull();
	});

	it("names the families that could not be loaded", () => {
		const message = unresolvedFontMessage(["Cascadia Code"]);
		expect(message).toContain("Cascadia Code");
	});

	it("refuses rather than describing, because a fallback ships silently", () => {
		// The message has to read as a stop, not as a note: an export that
		// quietly swaps the typeface is the failure this whole guard exists for.
		const message = unresolvedFontMessage(["Fira Code", "Cascadia Code"]);
		expect(message).toContain("Fira Code");
		expect(message).toContain("Cascadia Code");
		expect(message?.length ?? 0).toBeGreaterThan(40);
	});
});

describe("advanceDriftMessage", () => {
	it("passes two scopes that measured the same glyph identically", () => {
		expect(advanceDriftMessage(0.6, 0.6, "Fira Code, monospace")).toBeNull();
	});

	it("tolerates the last bit of a float", () => {
		expect(advanceDriftMessage(0.6, 0.600001, "Fira Code, monospace")).toBeNull();
	});

	it("refuses the drift a substituted family actually produces", () => {
		// Measured in a real worker: Cascadia Code resolved to the fallback at
		// 0.600097 where the document had 0.585937.
		const message = advanceDriftMessage(0.600097, 0.585937, "Cascadia Code, monospace");
		expect(message).not.toBeNull();
		expect(message).toContain("Cascadia Code");
	});

	it("draws the line where a line of code visibly moves", () => {
		expect(MAX_ADVANCE_DRIFT).toBeLessThan(0.01416);
		expect(MAX_ADVANCE_DRIFT).toBeGreaterThan(0.000107);
	});
});
