import type { ProjectPayload } from "@/application/project/project-payload";
import { projectFingerprint } from "@/application/project/project-fingerprint";
import { describe, expect, it } from "vitest";

/**
 * The fingerprint is what lets the studio ask "is this the user's own work?"
 * before a template overwrites it. It must react to EVERY authored field and
 * ignore everything that is merely how an object was spelled.
 */

/** A fully-populated project. `Required` so a new payload field fails to compile here. */
const FULL: Required<ProjectPayload> = {
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
	progressStyle: "reels",
	typewriter: false,
	focusZoom: false,
	transitionMs: 650,
	width: 1920,
	height: 1080,
	steps: [
		{ code: "const a = 1;", duration: 1000, focus: "1", caption: "one" },
		{ code: "const a = 2;", duration: 1200, focus: "1", caption: "two" },
	],
};

/** The same project with every single field changed. */
const CHANGED: Required<ProjectPayload> = {
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
	progressStyle: "bar",
	typewriter: true,
	focusZoom: true,
	transitionMs: 1000,
	width: 1080,
	height: 1920,
	steps: [{ code: "const a = 1;", duration: 1000, focus: "2", caption: "one" }],
};

describe("projectFingerprint", () => {
	it("is stable for the same project", () => {
		expect(projectFingerprint(FULL)).toBe(projectFingerprint({ ...FULL }));
	});

	it("changes when ANY authored field changes", () => {
		const baseline = projectFingerprint(FULL);
		for (const key of Object.keys(FULL) as (keyof ProjectPayload)[]) {
			const mutated = { ...FULL, [key]: CHANGED[key] };
			expect(
				projectFingerprint(mutated),
				`changing '${key}' must be visible to the fingerprint`,
			).not.toBe(baseline);
		}
	});

	it("changes when steps are reordered", () => {
		const reversed = { ...FULL, steps: [...FULL.steps].reverse() };
		expect(projectFingerprint(reversed)).not.toBe(projectFingerprint(FULL));
	});

	it("ignores the order the object's keys were written in", () => {
		// Two producers spelling the same project differently are the same project.
		const shuffled: ProjectPayload = {
			steps: FULL.steps,
			height: FULL.height,
			width: FULL.width,
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
			progressStyle: FULL.progressStyle,
			typewriter: FULL.typewriter,
			focusZoom: FULL.focusZoom,
			transitionMs: FULL.transitionMs,
		};
		expect(projectFingerprint(shuffled)).toBe(projectFingerprint(FULL));
	});

	it("treats an absent optional field and an explicit undefined as the same", () => {
		const absent: ProjectPayload = {
			title: "t",
			code: "c",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:aurora",
			steps: [{ code: "c", duration: 1000 }],
		};
		const explicit: ProjectPayload = { ...absent, watermark: undefined, width: undefined };
		expect(projectFingerprint(explicit)).toBe(projectFingerprint(absent));
	});

	it("treats a step's absent focus and an empty focus as the same", () => {
		// The store parses "" into no ranges and serializes it back as absent: the
		// two spellings must not read as an edit.
		const absent: ProjectPayload = {
			title: "t",
			code: "c",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:aurora",
			steps: [{ code: "c", duration: 1000 }],
		};
		const empty: ProjectPayload = {
			...absent,
			steps: [{ code: "c", duration: 1000, focus: "", caption: "" }],
		};
		expect(projectFingerprint(empty)).toBe(projectFingerprint(absent));
	});
});
