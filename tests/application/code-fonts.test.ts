import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
	FONT_PRESETS,
	LOADABLE_FONTS,
	fontsToLoad,
	primaryFamily,
	selfHostedFaces,
} from "@/application/fonts/code-fonts";
import { fontFaceRules, parseFontFaceSources } from "@/application/fonts/font-face-css";
import {
	MAX_ADVANCE_DRIFT,
	advanceDriftMessage,
	unresolvedFontMessage,
} from "@/application/fonts/font-fidelity";
import { describe, expect, it } from "vitest";

/** The faces a registered family serves itself. */
function facesOf(family: string) {
	const [font] = fontsToLoad(family);
	if (!font) {
		throw new Error(`${family} is not in the registry`);
	}
	return selfHostedFaces(font);
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".html"]);

/** Every source file under `path`, which may itself be one file. */
function sourceFiles(path: string): string[] {
	if (statSync(path).isDirectory()) {
		return readdirSync(path).flatMap((name) => sourceFiles(join(path, name)));
	}
	return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
}

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
			expect(font.files.length, font.family).toBeGreaterThan(0);
		}
	});

	it("serves every family from the app, none from a third party", () => {
		for (const font of LOADABLE_FONTS) {
			for (const face of selfHostedFaces(font)) {
				expect(face.url, font.family).toMatch(/^\/fonts\//);
			}
		}
	});

	it("serves each picker font at the code fonts' three weights, Latin first to arrive", () => {
		for (const font of FONT_PRESETS) {
			const faces = selfHostedFaces(font);
			expect(new Set(faces.map((face) => face.weight)), font.family).toEqual(
				new Set(["400", "500", "700"]),
			);
			const latin = faces.find((face) => face.unicodeRange?.startsWith("U+0000-00FF"));
			expect(latin?.url, font.family).toMatch(/-latin\.woff2$/);
			// Where ranges overlap the later rule wins, and Latin must win.
			expect(faces.at(-1)?.url, font.family).toBe(latin?.url);
		}
	});

	it("ships a licence next to every family's files", () => {
		// Every family is OFL, and the licence travels with the files. Ioskeley
		// Mono came without one: the gap predates this and is a ticket of its own.
		for (const font of LOADABLE_FONTS.filter((entry) => entry.family !== "Ioskeley Mono")) {
			for (const file of font.files) {
				const prefix = file.url.replace("/fonts/", "").split("-")[0] ?? "";
				expect(existsSync(resolve("public/fonts", `${prefix}-OFL.txt`)), file.url).toBe(true);
			}
		}
	});

	it("sets the step captions in Inter at the weights they use", () => {
		const [inter] = fontsToLoad("Inter, ui-sans-serif, system-ui, sans-serif");
		expect(inter?.family).toBe("Inter");
		expect(new Set(facesOf("Inter").map((face) => face.weight))).toEqual(
			new Set(["400", "500", "600"]),
		);
		expect(FONT_PRESETS).not.toContain(inter);
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
		expect(facesOf("Ioskeley Mono").map((face) => [face.url, face.weight])).toEqual([
			["/fonts/IoskeleyMono-Regular.woff2", "400"],
			["/fonts/IoskeleyMono-SemiBold.woff2", "600"],
		]);
		expect(FONT_PRESETS).not.toContain(ioskeley);
	});

	it("ships every self-hosted file it names", () => {
		for (const font of LOADABLE_FONTS) {
			for (const face of selfHostedFaces(font)) {
				expect(face.url, font.family).toMatch(/^\/fonts\/[\w-]+\.woff2$/);
				expect(existsSync(resolve("public", `.${face.url}`)), face.url).toBe(true);
			}
		}
	});
});

describe("the default code font", () => {
	it("is served by the app, at the code fonts' three weights", () => {
		// The default theme's face is on screen the moment the studio opens, so it
		// cannot wait on a third party: every scope loads the same files from /fonts.
		const [jetbrains] = fontsToLoad("JetBrains Mono, monospace");
		expect(jetbrains?.family).toBe("JetBrains Mono");
		const faces = facesOf("JetBrains Mono");
		expect(new Set(faces.map((face) => face.weight))).toEqual(new Set(["400", "500", "700"]));
		expect(faces.every((face) => face.family === "JetBrains Mono")).toBe(true);
		expect(faces.find((face) => face.unicodeRange?.startsWith("U+0000-00FF"))?.url).toBe(
			"/fonts/JetBrainsMono-latin.woff2",
		);
	});
});

describe("the text layers' face", () => {
	it("holds Geist at the four weights every scope registers", () => {
		// A text layer is set in Geist at 650, which resolves to the 700 face in a
		// scope holding 400, 500, 600 and 700. The variable file is registered once
		// per weight, as Google served it, never as one 400-700 range: a range
		// would draw 650 at 650, and 550 would land differently in a scope that
		// registered the faces apart.
		const [geist] = fontsToLoad("Geist, ui-sans-serif, system-ui, sans-serif");
		expect(geist?.family).toBe("Geist");
		const faces = facesOf("Geist");
		expect(new Set(faces.map((face) => face.weight))).toEqual(
			new Set(["400", "500", "600", "700"]),
		);
		expect(faces.every((face) => face.unicodeRange)).toBe(true);
		expect(FONT_PRESETS).not.toContain(geist);
	});
});

describe("the document's fonts", () => {
	const html = readFileSync(resolve("index.html"), "utf8");

	it("asks no third party for a font", () => {
		expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
	});

	it("is the whole app's rule: no source file names a font host", () => {
		// The preview, the worker, the server and the captions all read /fonts.
		// A `<link>` or a `fetch` to Google's font hosts sends the visitor's address
		// to a third party, which an app that uploads nothing does not do.
		const offenders = ["src", "server", "index.html"]
			.flatMap((entry) => sourceFiles(resolve(entry)))
			.filter((file) => /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(file, "utf8")));
		expect(offenders).toEqual([]);
	});

	it("preloads the Geist file the first paint sets text in", () => {
		const latin = facesOf("Geist").find((face) => face.unicodeRange?.startsWith("U+0000-00FF"));
		expect(latin?.url).toBe("/fonts/Geist-latin.woff2");
		expect(html).toContain(
			'<link rel="preload" href="/fonts/Geist-latin.woff2" as="font" type="font/woff2" crossorigin />',
		);
	});
});

describe("fontFaceRules", () => {
	it("writes faces back as the rules the reader reads", () => {
		const faces = facesOf("Geist");
		const css = fontFaceRules(faces);
		expect(parseFontFaceSources(css)).toEqual(faces);
		expect(css).toContain("font-display: swap");
	});

	it("lets a bundle point a face at its own copy of the file", () => {
		const faces = facesOf("Ioskeley Mono");
		const css = fontFaceRules(faces, (url) => `bundle:${url}`);
		expect(parseFontFaceSources(css).map((face) => face.url)).toEqual([
			"bundle:/fonts/IoskeleyMono-Regular.woff2",
			"bundle:/fonts/IoskeleyMono-SemiBold.woff2",
		]);
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
