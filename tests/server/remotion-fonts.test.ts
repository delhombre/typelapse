import { afterEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_FONT_URLS, fontStylesheets } from "../../server/remotion/font-files";
import { LOADABLE_FONTS, selfHostedFaces } from "../../src/application/fonts/code-fonts";
import { parseFontFaceSources } from "../../src/application/fonts/font-face-css";

describe("the server composition's fonts", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("bundles every file the registry serves", () => {
		for (const font of LOADABLE_FONTS) {
			for (const face of selfHostedFaces(font)) {
				expect(BUNDLED_FONT_URLS[face.url], face.url).toBeTruthy();
			}
		}
	});

	it("sets the default code font and Geist from the bundle, asking no one", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		const sheets = await fontStylesheets(
			"JetBrains Mono, monospace",
			"Geist, ui-sans-serif, system-ui, sans-serif",
		);

		expect(fetchSpy).not.toHaveBeenCalled();
		const faces = sheets.flatMap(parseFontFaceSources);
		expect(new Set(faces.map((face) => face.family))).toEqual(new Set(["JetBrains Mono", "Geist"]));
		const latin = faces.find(
			(face) => face.family === "Geist" && face.weight === "700" && face.unicodeRange?.startsWith("U+0000-00FF"),
		);
		expect(latin?.url).toBe(BUNDLED_FONT_URLS["/fonts/Geist-latin.woff2"]);
	});

	it("sets every picker font and the captions' Inter from local files, asking no one", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		for (const font of LOADABLE_FONTS) {
			const sheets = await fontStylesheets(font.stack);
			const faces = sheets.flatMap(parseFontFaceSources);

			const wanted = selfHostedFaces(font);

			expect(faces.length, font.family).toBe(wanted.length);
			faces.forEach((face, index) => {
				expect(face.family).toBe(font.family);
				// The bundle's own copy of the registry's file, never a host.
				expect(face.url, font.family).toBe(BUNDLED_FONT_URLS[wanted[index]?.url ?? ""]);
				expect(face.url, font.family).not.toMatch(/^https?:/);
			});
		}
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
