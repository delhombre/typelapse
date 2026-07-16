import { parseUnifiedDiff } from "@/application/diff/parse-unified-diff";
import type { DiffFile, DiffHunk, DiffLine } from "@/application/diff/types";
import {
	CONTEXT_LINES,
	ELLIPSIS,
	computeHunkWindows,
	fileHeaderLine,
	filterLockfiles,
	isLockfile,
	planWindows,
	renderWindowedStage,
} from "@/application/diff/windowing";
import { describe, expect, it } from "vitest";

const ctx = (content: string): DiffLine => ({ type: "context", content });
const add = (content: string): DiffLine => ({ type: "add", content });
const rem = (content: string): DiffLine => ({ type: "remove", content });

/** Build a hunk from document-order lines, deriving old/new counts from the sides. */
function mkHunk(lines: DiffLine[], oldStart = 1, newStart = 1): DiffHunk {
	const oldLines = lines.filter((l) => l.type !== "add").length;
	const newLines = lines.filter((l) => l.type !== "remove").length;
	return { oldStart, oldLines, newStart, newLines, heading: "", lines };
}

function mkFile(hunks: DiffHunk[], path = "src/app.ts"): DiffFile {
	return { oldPath: path, newPath: path, isNew: false, isDeleted: false, hunks };
}

/** The stage-independent scaffold: separator and file-header lines only. */
const structural = (code: string): string[] =>
	code.split("\n").filter((line) => line === ELLIPSIS || line.startsWith("// "));

describe("computeHunkWindows", () => {
	it("wraps a single change in ±CONTEXT context lines as one window", () => {
		expect(CONTEXT_LINES).toBe(3);
		// 5 leading + change + 5 trailing context: padding keeps only 3 each side.
		const hunk = mkHunk([
			ctx("a"),
			ctx("b"),
			ctx("c"),
			ctx("d"),
			ctx("e"),
			rem("old"),
			add("new"),
			ctx("f"),
			ctx("g"),
			ctx("h"),
			ctx("i"),
			ctx("j"),
		]);
		// changes at indices 5,6 → padded [2..9].
		expect(computeHunkWindows(hunk)).toEqual([{ start: 2, end: 9 }]);
	});

	it("merges two changes whose padded windows sit within MERGE_GAP into one window", () => {
		const lines: DiffLine[] = [ctx("a"), ctx("b"), ctx("c"), rem("x")]; // change at 3
		for (let i = 0; i < 6; i++) {
			lines.push(ctx(`m${i}`)); // indices 4..9
		}
		lines.push(add("y"), ctx("p"), ctx("q"), ctx("r")); // change at 10
		// [0..6] and [7..13] → gap 0 ≤ 2 → merge.
		expect(computeHunkWindows(mkHunk(lines))).toEqual([{ start: 0, end: 13 }]);
	});

	it("splits two far-apart changes into two windows", () => {
		const lines: DiffLine[] = [ctx("a"), ctx("b"), ctx("c"), rem("x")]; // change at 3
		for (let i = 0; i < 10; i++) {
			lines.push(ctx(`m${i}`)); // indices 4..13
		}
		lines.push(add("y"), ctx("p"), ctx("q"), ctx("r")); // change at 14
		const windows = computeHunkWindows(mkHunk(lines));
		// [0..6] and [11..17] → gap 4 > 2 → two windows.
		expect(windows).toHaveLength(2);
		expect(windows[0]).toEqual({ start: 0, end: 6 });
		expect(windows[1]).toEqual({ start: 11, end: 17 });
	});

	it("clamps a change at the hunk's first line to start at 0", () => {
		const hunk = mkHunk([rem("first"), ctx("a"), ctx("b"), ctx("c"), ctx("d"), ctx("e"), ctx("f")]);
		expect(computeHunkWindows(hunk)).toEqual([{ start: 0, end: 3 }]);
	});

	it("clamps a change at the hunk's last line to end at n-1", () => {
		const hunk = mkHunk([ctx("a"), ctx("b"), ctx("c"), ctx("d"), ctx("e"), ctx("f"), add("last")]);
		// n=7, change at 6 → [3..6].
		expect(computeHunkWindows(hunk)).toEqual([{ start: 3, end: 6 }]);
	});
});

describe("renderWindowedStage", () => {
	it("renders a single small hunk with no separators", () => {
		const plans = planWindows([
			mkFile([mkHunk([ctx("head"), rem("old"), add("new"), ctx("tail")])]),
		]);
		expect(renderWindowedStage(plans, 0)).toBe(["head", "old", "tail"].join("\n"));
		expect(renderWindowedStage(plans, 1)).toBe(["head", "new", "tail"].join("\n"));
	});

	it("inserts one ⋯ separator between two far-apart hunks", () => {
		const h1 = mkHunk([ctx("const a = 1;"), rem("const b = 2;"), add("const b = 20;")], 1);
		const h2 = mkHunk([ctx("const c = 3;"), add("const d = 4;"), ctx("const e = 5;")], 10);
		const plans = planWindows([mkFile([h1, h2], "app.ts")]);

		expect(renderWindowedStage(plans, 0)).toBe(
			["const a = 1;", "const b = 2;", ELLIPSIS, "const c = 3;", "const e = 5;"].join("\n"),
		);
		for (const applied of [0, 1, 2]) {
			const separators = renderWindowedStage(plans, applied)
				.split("\n")
				.filter((l) => l === ELLIPSIS);
			expect(separators).toHaveLength(1);
		}
	});

	it("renders two near hunks adjacent, with no separator (merge)", () => {
		const h1 = mkHunk([rem("let x = 1;"), add("let x = 2;")], 1); // covers old line 1
		const h2 = mkHunk([rem("let y = 1;"), add("let y = 2;")], 2); // gap = 2-(1+1) = 0
		const plans = planWindows([mkFile([h1, h2], "near.ts")]);

		expect(renderWindowedStage(plans, 2)).toBe(["let x = 2;", "let y = 2;"].join("\n"));
		expect(renderWindowedStage(plans, 2)).not.toContain(ELLIPSIS);
	});

	it("prepends a ⋯ when the first hunk starts below file line 1", () => {
		const hunk = mkHunk([ctx("x"), rem("y"), add("z"), ctx("w")], 5); // oldStart 5 > 1
		const plans = planWindows([mkFile([hunk], "mid.ts")]);
		expect(renderWindowedStage(plans, 0).split("\n")[0]).toBe(ELLIPSIS);
	});

	it("does not prepend a ⋯ when the first hunk starts at file line 1", () => {
		const hunk = mkHunk([ctx("x"), rem("y"), add("z"), ctx("w")], 1);
		const plans = planWindows([mkFile([hunk], "top.ts")]);
		expect(renderWindowedStage(plans, 0).startsWith(ELLIPSIS)).toBe(false);
	});

	it("appends a ⋯ when the last window trims the hunk's tail", () => {
		const lines: DiffLine[] = [ctx("h"), rem("old"), add("new")];
		for (let i = 0; i < 6; i++) {
			lines.push(ctx(`t${i}`)); // 6 trailing context lines get trimmed
		}
		const plans = planWindows([mkFile([mkHunk(lines, 1)], "tail.ts")]);
		const out = renderWindowedStage(plans, 0).split("\n");
		expect(out[out.length - 1]).toBe(ELLIPSIS);
	});

	it("does not append a ⋯ when the change reaches the hunk's end (EOF unknown)", () => {
		const hunk = mkHunk([ctx("a"), ctx("b"), ctx("c"), rem("old"), add("new")], 1);
		const plans = planWindows([mkFile([hunk], "eof.ts")]);
		expect(renderWindowedStage(plans, 0).endsWith(ELLIPSIS)).toBe(false);
	});

	it("shifts a downstream window down by an applied upstream hunk's net line delta", () => {
		// hunk1 nets +3 lines (1 old line "keep" → keep + 3 additions).
		const h1 = mkHunk([ctx("keep"), add("n1"), add("n2"), add("n3")], 1);
		// hunk2 sits far below and is untouched in stage 1.
		const h2 = mkHunk([ctx("A"), rem("B"), add("C"), ctx("D")], 20);
		const plans = planWindows([mkFile([h1, h2], "shift.ts")]);

		// Stage 0: both "before", hunk1 is just "keep"; hunk2's window opens at line 3.
		expect(renderWindowedStage(plans, 0)).toBe(["keep", ELLIPSIS, "A", "B", "D"].join("\n"));
		// Stage 1: hunk1 applied (+3 lines) → hunk2's identical window is pushed to line 6.
		expect(renderWindowedStage(plans, 1)).toBe(
			["keep", "n1", "n2", "n3", ELLIPSIS, "A", "B", "D"].join("\n"),
		);
	});

	it("labels each file with a stable // path header in a multi-file diff", () => {
		const fileA = mkFile([mkHunk([ctx("a1"), rem("a2"), add("a2b"), ctx("a3")], 1)], "src/one.ts");
		const fileB = mkFile([mkHunk([ctx("b1"), rem("b2"), add("b2b"), ctx("b3")], 1)], "src/two.ts");
		const plans = planWindows([fileA, fileB]);
		const stage0 = renderWindowedStage(plans, 0);

		expect(stage0).toContain(fileHeaderLine("src/one.ts"));
		expect(stage0).toContain(fileHeaderLine("src/two.ts"));
		expect(stage0.split("\n")[0]).toBe("// src/one.ts");
	});

	it("does not label a single-file diff with a header", () => {
		const plans = planWindows([mkFile([mkHunk([ctx("a"), rem("b"), add("c")])], "solo.ts")]);
		expect(renderWindowedStage(plans, 0)).not.toContain("// ");
	});

	it("keeps every separator and header byte-identical across all stages", () => {
		const h1 = mkHunk([ctx("const a = 1;"), rem("const b = 2;"), add("const b = 20;")], 1);
		const h2 = mkHunk([ctx("const c = 3;"), add("const d = 4;"), ctx("const e = 5;")], 10);
		const fileA = mkFile([h1, h2], "a.ts");
		const fileB = mkFile([mkHunk([ctx("z1"), rem("z2"), add("z2b"), ctx("z3")], 1)], "b.ts");
		const plans = planWindows([fileA, fileB]);

		const total = 3; // 2 + 1 hunks
		const scaffolds: string[][] = [];
		for (let applied = 0; applied <= total; applied++) {
			scaffolds.push(structural(renderWindowedStage(plans, applied)));
		}
		for (const scaffold of scaffolds) {
			expect(scaffold).toEqual(scaffolds[0]);
		}
		expect(scaffolds[0]).toEqual(["// a.ts", ELLIPSIS, "// b.ts"]);
	});

	it("keeps windows structurally stable across the stages of a parsed multi-hunk diff", () => {
		const diff = [
			"--- a/app.ts",
			"+++ b/app.ts",
			"@@ -1,2 +1,2 @@",
			" const a = 1;",
			"-const b = 2;",
			"+const b = 20;",
			"@@ -10,2 +10,3 @@",
			" const c = 3;",
			"+const d = 4;",
			" const e = 5;",
		].join("\n");
		const plans = planWindows(parseUnifiedDiff(diff).files);
		const scaffolds = [0, 1, 2].map((applied) => structural(renderWindowedStage(plans, applied)));
		for (const scaffold of scaffolds) {
			expect(scaffold).toEqual([ELLIPSIS]);
		}
	});
});

describe("isLockfile / filterLockfiles", () => {
	it("recognizes common lockfiles by basename", () => {
		expect(isLockfile("pnpm-lock.yaml")).toBe(true);
		expect(isLockfile("package-lock.json")).toBe(true);
		expect(isLockfile("yarn.lock")).toBe(true);
		expect(isLockfile("bun.lockb")).toBe(true);
		expect(isLockfile("Cargo.lock")).toBe(true);
		expect(isLockfile("nested/dir/poetry.lock")).toBe(true);
	});

	it("treats real source files as non-lockfiles", () => {
		expect(isLockfile("src/app.ts")).toBe(false);
		expect(isLockfile("package.json")).toBe(false);
		expect(isLockfile(null)).toBe(false);
		expect(isLockfile(undefined)).toBe(false);
	});

	it("drops lockfiles from a mixed file list", () => {
		const files = [
			mkFile([mkHunk([rem("x"), add("y")])], "package.json"),
			mkFile([mkHunk([rem("a"), add("b")])], "pnpm-lock.yaml"),
		];
		const kept = filterLockfiles(files);
		expect(kept).toHaveLength(1);
		expect(kept[0]?.newPath).toBe("package.json");
	});

	it("keeps lockfiles when the diff contains nothing else", () => {
		const files = [
			mkFile([mkHunk([rem("x"), add("y")])], "pnpm-lock.yaml"),
			mkFile([mkHunk([rem("a"), add("b")])], "yarn.lock"),
		];
		expect(filterLockfiles(files)).toHaveLength(2);
	});
});
