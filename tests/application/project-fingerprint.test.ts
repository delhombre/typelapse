import { type ProjectContent, contentFingerprint } from "@/application/project/project-fingerprint";
import { describe, expect, it } from "vitest";

/**
 * The fingerprint is what lets the studio ask "is this the user's own work?"
 * before a template overwrites it. It must react to EVERY authored field and
 * ignore everything that is merely how an object was spelled.
 */

/** Fully-populated content. `Required` so a new content field fails to compile here. */
const FULL: Required<ProjectContent> = {
	title: "Original",
	code: "const a = 1;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:aurora",
	windowChrome: "macos",
	showLineNumbers: true,
	lineNumberStart: 1,
	framePadding: 24,
	cardMargin: 32,
	watermark: "",
	steps: [
		{ code: "const a = 1;", duration: 1000, focus: "1", caption: "one" },
		{ code: "const a = 2;", duration: 1200, focus: "1", caption: "two" },
	],
};

/** The same content with every single field changed. */
const CHANGED: Required<ProjectContent> = {
	title: "Renamed",
	code: "const b = 1;",
	language: "python",
	themeName: "nord",
	background: "mesh:ocean",
	windowChrome: "terminal",
	showLineNumbers: false,
	lineNumberStart: 7,
	framePadding: 40,
	cardMargin: 48,
	watermark: "Acme",
	steps: [{ code: "const a = 1;", duration: 1000, focus: "2", caption: "one" }],
};

describe("contentFingerprint", () => {
	it("is stable for the same content", () => {
		expect(contentFingerprint(FULL)).toBe(contentFingerprint({ ...FULL }));
	});

	it("changes when ANY authored field changes", () => {
		const baseline = contentFingerprint(FULL);
		for (const key of Object.keys(FULL) as (keyof ProjectContent)[]) {
			const mutated = { ...FULL, [key]: CHANGED[key] };
			expect(
				contentFingerprint(mutated),
				`changing '${key}' must be visible to the fingerprint`,
			).not.toBe(baseline);
		}
	});

	it("changes when steps are reordered", () => {
		const reversed = { ...FULL, steps: [...FULL.steps].reverse() };
		expect(contentFingerprint(reversed)).not.toBe(contentFingerprint(FULL));
	});

	it("ignores the order the object's keys were written in", () => {
		// Two producers spelling the same content differently mean the same thing.
		const shuffled: ProjectContent = {
			steps: FULL.steps,
			background: FULL.background,
			themeName: FULL.themeName,
			language: FULL.language,
			code: FULL.code,
			title: FULL.title,
			windowChrome: FULL.windowChrome,
			showLineNumbers: FULL.showLineNumbers,
			lineNumberStart: FULL.lineNumberStart,
			framePadding: FULL.framePadding,
			cardMargin: FULL.cardMargin,
			watermark: FULL.watermark,
		};
		expect(contentFingerprint(shuffled)).toBe(contentFingerprint(FULL));
	});

	it("treats an absent optional field and an explicit undefined as the same", () => {
		const absent: ProjectContent = {
			title: "t",
			code: "c",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:aurora",
			steps: [{ code: "c", duration: 1000 }],
		};
		const explicit: ProjectContent = { ...absent, watermark: undefined, cardMargin: undefined };
		expect(contentFingerprint(explicit)).toBe(contentFingerprint(absent));
	});

	it("treats a step's absent focus and an empty focus as the same", () => {
		// The store parses "" into no ranges and serializes it back as absent: the
		// two spellings must not read as an edit.
		const absent: ProjectContent = {
			title: "t",
			code: "c",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:aurora",
			steps: [{ code: "c", duration: 1000 }],
		};
		const empty: ProjectContent = {
			...absent,
			steps: [{ code: "c", duration: 1000, focus: "", caption: "" }],
		};
		expect(contentFingerprint(empty)).toBe(contentFingerprint(absent));
	});
});
