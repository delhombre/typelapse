import { afterEach, describe, expect, it, vi } from "vitest";
import {
	BUNDLED_FONT_URLS,
	CAPTION_FONT_PROBE,
	fontStylesheets,
	loadCompositionFonts,
} from "../../server/remotion/font-files";
import { LOADABLE_FONTS, selfHostedFaces } from "../../src/application/fonts/code-fonts";
import { parseFontFaceSources } from "../support/font-face-parser";

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

	describe("loadCompositionFonts", () => {
		function stubDocumentFonts(load: (font: string, text?: string) => Promise<unknown>) {
			const ready = vi.fn(async () => undefined);
			Object.defineProperty(document, "fonts", {
				configurable: true,
				value: { load, get ready() { return ready(); } },
			});
			return ready;
		}

		afterEach(() => {
			Reflect.deleteProperty(document, "fonts");
			for (const style of document.head.querySelectorAll("style")) {
				style.remove();
			}
		});

		it("asks for the caption's Inter at its weight, alongside the theme's probe", async () => {
			const load = vi.fn(async () => []);
			stubDocumentFonts(load);

			await loadCompositionFonts("16px 'Fira Code'", "Fira Code, monospace", "Inter");

			expect(CAPTION_FONT_PROBE).toBe("500 16px Inter");
			expect(load).toHaveBeenCalledWith("16px 'Fira Code'", "0");
			expect(load).toHaveBeenCalledWith(CAPTION_FONT_PROBE, "A");
		});

		it("registers the bundled faces before it asks for them", async () => {
			const seen: number[] = [];
			stubDocumentFonts(async () => {
				seen.push(document.head.querySelectorAll("style").length);
				return [];
			});

			await loadCompositionFonts("16px Inter", "Inter");

			expect(seen.every((count) => count > 0)).toBe(true);
		});

		it("holds the frame until the caption face has loaded, not just the probe", async () => {
			let releaseCaption: () => void = () => undefined;
			const captionLoaded = new Promise<void>((resolve) => {
				releaseCaption = resolve;
			});
			stubDocumentFonts((font) => (font === CAPTION_FONT_PROBE ? captionLoaded : Promise.resolve([])));

			let done = false;
			const loading = loadCompositionFonts("16px Inter", "Inter").then(() => {
				done = true;
			});
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(done).toBe(false);

			releaseCaption();
			await loading;
			expect(done).toBe(true);
		});
	});
});
