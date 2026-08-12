import type { ProjectPayload } from "@/application/project/project-payload";
import { MAX_RENDER_DIMENSION } from "@/domain/entities/render-config";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { decodeShareLink, encodeShareLink } from "@/presentation/utils/share-link";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Every studio setting must survive a JSON export/import AND a share-link
 * encode/decode. Both paths carry the same complete set, split across the snippet
 * store (title, code, language, theme, background, chrome, gutter, framePadding,
 * cardMargin, watermark) and the export store (aspect, progressStyle, typewriter,
 * focusZoom, transitionMs), plus per-step {code, duration, focus, caption}.
 */

/**
 * A snapshot with EVERY round-tripped setting at a non-default value. Typed as
 * `ProjectPayload` on purpose: the format's own type must be able to express a
 * fully-populated project, so a field added to the studio but forgotten in the
 * payload fails to compile here.
 */
const FULL: ProjectPayload = {
	title: "Round Trip",
	code: "const z = 42;",
	language: "python",
	themeName: "nord",
	background: "#123456",
	windowChrome: "terminal",
	showLineNumbers: false,
	lineNumberStart: 7,
	framePadding: 40,
	cardMargin: 48,
	watermark: "Acme",
	progressStyle: "bar",
	typewriter: true,
	focusZoom: true,
	transitionMs: 1000,
	width: 1080,
	height: 1920,
	steps: [
		{ code: "const z = 1;", duration: 900, focus: "1", caption: "start" },
		{ code: "const z = 42;", duration: 1300, focus: "1", caption: "end" },
	],
};

/** Reset both stores to their defaults so the round-trip proves import wrote them. */
function resetStores() {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "defaults",
			code: "const a = 0;",
			language: "typescript",
			themeName: "midnight",
			steps: [],
		}),
	);
	const ex = useExportStore.getState();
	ex.setTransitionMs(650);
	ex.setFocusZoom(false);
	ex.setTypewriter(false);
	ex.setProgressStyle("reels");
	ex.setResolution(1920, 1080);
}

describe("JSON export/import round-trips every studio setting", () => {
	beforeEach(resetStores);

	it("applies every field to both stores on import", () => {
		useSnippetStore.getState().importFromJson(JSON.stringify(FULL));

		const s = useSnippetStore.getState();
		expect(s.snippet.title).toBe("Round Trip");
		expect(s.snippet.code).toBe("const z = 42;");
		expect(s.snippet.language).toBe("python");
		expect(s.snippet.theme.name).toBe("nord");
		expect(s.background).toBe("#123456");
		expect(s.windowChrome).toBe("terminal");
		expect(s.showLineNumbers).toBe(false);
		expect(s.lineNumberStart).toBe(7);
		expect(s.framePadding).toBe(40);
		expect(s.cardMargin).toBe(48);
		expect(s.watermark).toBe("Acme");

		const ex = useExportStore.getState();
		expect(ex.progressStyle).toBe("bar");
		expect(ex.typewriter).toBe(true);
		expect(ex.focusZoom).toBe(true);
		expect(ex.transitionMs).toBe(1000);
		expect(ex.width).toBe(1080);
		expect(ex.height).toBe(1920);
	});

	it("keeps the aspect intact when a file carries a nonsense one", () => {
		// Hand-edited files and old share links must never poison the render size.
		useSnippetStore.getState().importFromJson(
			JSON.stringify({
				...FULL,
				width: 0,
				height: -8,
			}),
		);

		const ex = useExportStore.getState();
		expect(ex.width).toBe(1920);
		expect(ex.height).toBe(1080);
	});

	/**
	 * The studio's ceiling has to be the renderer's ceiling. The render route
	 * clamps each axis at `MAX_RENDER_DIMENSION`, and it clamps them
	 * INDEPENDENTLY: accepting 4000x2250 here would preview a 16:9 export and
	 * render a 3840x2250 one, a shape the user never chose. So anything the server
	 * would clamp is refused at the door, and the aspect falls back to the default
	 * — the project still opens, which is the graceful part.
	 */
	describe("the aspect ceiling matches what the renderer will accept", () => {
		const importWith = (width: number, height: number) => {
			useSnippetStore.getState().importFromJson(JSON.stringify({ ...FULL, width, height }));
			return useExportStore.getState();
		};

		it(`accepts an export at the ceiling (${MAX_RENDER_DIMENSION})`, () => {
			const ex = importWith(MAX_RENDER_DIMENSION, 2160);

			expect(ex.width).toBe(MAX_RENDER_DIMENSION);
			expect(ex.height).toBe(2160);
		});

		it("refuses one pixel above the ceiling and keeps the default aspect", () => {
			const ex = importWith(MAX_RENDER_DIMENSION + 1, 2160);

			expect(ex.width).toBe(1920);
			expect(ex.height).toBe(1080);
		});

		it("refuses a height above the ceiling too", () => {
			const ex = importWith(2160, MAX_RENDER_DIMENSION + 1);

			expect(ex.width).toBe(1920);
			expect(ex.height).toBe(1080);
		});

		it("loads the rest of an out-of-range project instead of failing the import", () => {
			// Graceful: only the aspect is dropped, the authored work still arrives.
			expect(() =>
				useSnippetStore
					.getState()
					.importFromJson(JSON.stringify({ ...FULL, width: 4096, height: 2160 })),
			).not.toThrow();

			expect(useSnippetStore.getState().snippet.title).toBe(FULL.title);
			expect(useSnippetStore.getState().snippet.steps).toHaveLength(FULL.steps.length);
			expect(useExportStore.getState().width).toBe(1920);
		});
	});

	it("keeps the aspect intact when only one dimension is present", () => {
		// A half-specified aspect is not an aspect: applying it would silently
		// distort the export.
		useSnippetStore.getState().importFromJson(JSON.stringify({ ...FULL, height: undefined }));

		const ex = useExportStore.getState();
		expect(ex.width).toBe(1920);
		expect(ex.height).toBe(1080);
	});

	it("reproduces every field on export", () => {
		useSnippetStore.getState().importFromJson(JSON.stringify(FULL));
		const exported = JSON.parse(useSnippetStore.getState().exportToJson());

		expect(exported).toMatchObject({
			title: "Round Trip",
			code: "const z = 42;",
			language: "python",
			themeName: "nord",
			background: "#123456",
			windowChrome: "terminal",
			showLineNumbers: false,
			lineNumberStart: 7,
			framePadding: 40,
			cardMargin: 48,
			watermark: "Acme",
			progressStyle: "bar",
			typewriter: true,
			focusZoom: true,
			transitionMs: 1000,
			width: 1080,
			height: 1920,
		});
		expect(exported.steps).toHaveLength(2);
		expect(exported.steps[0]).toMatchObject({
			code: "const z = 1;",
			duration: 900,
			focus: "1",
			caption: "start",
		});
	});

	it("falls back to defaults for fields an older file omits", () => {
		// An older file: only the minimal required fields, no export-store settings
		// and no framePadding/cardMargin/watermark. It must still load, on defaults.
		useSnippetStore.getState().importFromJson(JSON.stringify(FULL));
		useSnippetStore.getState().importFromJson(
			JSON.stringify({
				title: "legacy",
				code: "const a = 1;",
				language: "typescript",
				themeName: "midnight",
				steps: [{ code: "const a = 1;", duration: 1000 }],
			}),
		);

		const s = useSnippetStore.getState();
		expect(s.framePadding).toBe(24);
		expect(s.cardMargin).toBe(32);
		expect(s.watermark).toBe("");
	});

	it("resets the render settings a file omits instead of inheriting them", () => {
		// A project fully determines its render. Otherwise loading the typewriter
		// template and then another would leave the second one typing itself, and
		// no file would be reproducible from its own contents.
		useSnippetStore.getState().importFromJson(JSON.stringify(FULL));
		useSnippetStore.getState().importFromJson(
			JSON.stringify({
				title: "plain",
				code: "const a = 1;",
				language: "typescript",
				themeName: "midnight",
				steps: [{ code: "const a = 1;", duration: 1000 }],
			}),
		);

		const ex = useExportStore.getState();
		expect(ex.typewriter).toBe(false);
		expect(ex.focusZoom).toBe(false);
		expect(ex.progressStyle).toBe("reels");
		expect(ex.transitionMs).toBe(650);
		expect(ex.width).toBe(1920);
		expect(ex.height).toBe(1080);
	});
});

describe("share link round-trips every studio setting", () => {
	beforeEach(() => {
		window.location.hash = "";
	});

	it("encodes then decodes every field", () => {
		const link = encodeShareLink(FULL);
		window.location.hash = link.slice(link.indexOf("#"));

		const decoded = decodeShareLink();
		expect(decoded).toMatchObject({
			title: "Round Trip",
			code: "const z = 42;",
			language: "python",
			themeName: "nord",
			background: "#123456",
			windowChrome: "terminal",
			showLineNumbers: false,
			lineNumberStart: 7,
			framePadding: 40,
			cardMargin: 48,
			watermark: "Acme",
			progressStyle: "bar",
			typewriter: true,
			focusZoom: true,
			transitionMs: 1000,
			width: 1080,
			height: 1920,
		});
		expect(decoded?.steps).toHaveLength(2);
		expect(decoded?.steps[0]).toMatchObject({
			code: "const z = 1;",
			duration: 900,
			focus: "1",
			caption: "start",
		});
	});
});

/**
 * A share link is the likeliest way an out-of-range aspect arrives: a link built
 * by an older studio, or one edited by hand. It must open the project and drop
 * only the aspect, never refuse the whole link.
 */
describe("a share link carrying an unrenderable aspect", () => {
	beforeEach(() => {
		window.location.hash = "";
	});

	it("opens the project and falls back to the default aspect", () => {
		const link = encodeShareLink({
			...FULL,
			width: MAX_RENDER_DIMENSION + 1,
			height: 2160,
		});
		window.location.hash = link.slice(link.indexOf("#"));

		const decoded = decodeShareLink();
		expect(decoded).not.toBeNull();
		expect(() => useSnippetStore.getState().importFromJson(JSON.stringify(decoded))).not.toThrow();

		// The authored work arrived; only the aspect the renderer would have
		// reshaped was dropped.
		expect(useSnippetStore.getState().snippet.title).toBe(FULL.title);
		expect(useExportStore.getState().width).toBe(1920);
		expect(useExportStore.getState().height).toBe(1080);
	});
});
