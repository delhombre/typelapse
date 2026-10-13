import {
	MAX_WALKTHROUGH_FILES,
	MAX_WALKTHROUGH_LINES,
	MAX_WALKTHROUGH_PAGES,
	budgetWalkthrough,
} from "@/application/diff/budget";
import { diffToSnapshots } from "@/application/diff/diff-to-snapshots";
import { parseUnifiedDiff } from "@/application/diff/parse-unified-diff";
import { MAX_SCENE_LINES } from "@/application/diff/scenes";
import type { CodeSnapshot } from "@/application/diff/types";
import { ELLIPSIS, planWindows } from "@/application/diff/windowing";
import { describe, expect, it } from "vitest";

const nl = (lines: string[]) => lines.join("\n");

/** N files, each a one-line edit between stable context: 20 files -> 20 headers. */
function manyFilesDiff(fileCount: number): string {
	const blocks: string[] = [];
	for (let k = 0; k < fileCount; k++) {
		blocks.push(
			`--- a/file${k}.ts`,
			`+++ b/file${k}.ts`,
			"@@ -1,3 +1,3 @@",
			` const a${k} = 1;`,
			`-const b${k} = 2;`,
			`+const b${k} = 20;`,
			` const c${k} = 3;`,
		);
	}
	return nl(blocks);
}

/** One file that inserts `addedLines` new lines: a single, very tall hunk. */
function oneTallFileDiff(addedLines: number): string {
	const lines = [
		"--- a/big.ts",
		"+++ b/big.ts",
		`@@ -1,2 +1,${addedLines + 2} @@`,
		" const header = 1;",
	];
	for (let i = 1; i <= addedLines; i++) {
		lines.push(`+line${i}`);
	}
	lines.push(" const footer = 2;");
	return nl(lines);
}

const TWO_FILE_DIFF = nl([
	"--- a/one.ts",
	"+++ b/one.ts",
	"@@ -1,2 +1,2 @@",
	" const a = 1;",
	"-const b = 2;",
	"+const b = 3;",
	"--- a/two.ts",
	"+++ b/two.ts",
	"@@ -1,2 +1,2 @@",
	" const c = 1;",
	"-const d = 2;",
	"+const d = 3;",
]);

/** Lines rendered as code, i.e. not the `⋯` scaffold, a `// path` header or the marker. */
function codeLines(frame: string): string[] {
	return frame.split("\n").filter((line) => !line.startsWith(ELLIPSIS) && !line.startsWith("// "));
}

/** File-attribution header lines in a rendered frame. */
function headerLines(frame: string): string[] {
	return frame.split("\n").filter((line) => line.startsWith("// "));
}

/** The single trailing omission marker (starts with `⋯ `, unlike a bare `⋯` separator). */
function markerOf(snapshots: CodeSnapshot[]): Set<string | undefined> {
	return new Set(
		snapshots.map((snapshot) => {
			const last = snapshot.code.split("\n").at(-1);
			return last?.startsWith(`${ELLIPSIS} `) ? last : undefined;
		}),
	);
}

describe("budgetWalkthrough", () => {
	it("caps at 6 files and 4 pages of 24 rows: the line budget is derived from the pages", () => {
		expect(MAX_WALKTHROUGH_FILES).toBe(6);
		expect(MAX_WALKTHROUGH_PAGES).toBe(4);
		expect(MAX_SCENE_LINES).toBe(24);
		expect(MAX_WALKTHROUGH_LINES).toBe(MAX_WALKTHROUGH_PAGES * MAX_SCENE_LINES);
	});

	it("keeps only the first MAX_WALKTHROUGH_FILES files and reports the dropped rest", () => {
		const plans = planWindows(parseUnifiedDiff(manyFilesDiff(20)).files);
		const { plans: budgeted, marker } = budgetWalkthrough(plans);

		expect(budgeted).toHaveLength(MAX_WALKTHROUGH_FILES);
		expect(marker).toBe(`${ELLIPSIS} 14 more files`);
	});

	it("truncates a single over-budget hunk instead of dropping the whole file", () => {
		const full = planWindows(parseUnifiedDiff(oneTallFileDiff(200)).files);
		const { plans: budgeted, marker } = budgetWalkthrough(full);

		// The one file is kept, but its single tall window is trimmed, not dropped.
		expect(budgeted).toHaveLength(1);
		const keptEnd = budgeted[0]?.windows[0]?.[0]?.end ?? 0;
		const fullEnd = full[0]?.windows[0]?.[0]?.end ?? 0;
		expect(keptEnd).toBeLessThan(fullEnd);
		expect(marker).toBe(`${ELLIPSIS} more changes hidden`);
	});

	it("is a byte-for-byte no-op for a small diff (no marker, same file count)", () => {
		const plans = planWindows(parseUnifiedDiff(TWO_FILE_DIFF).files);
		const { plans: budgeted, marker } = budgetWalkthrough(plans);

		expect(marker).toBeNull();
		expect(budgeted).toHaveLength(2);
	});
});

describe("diffToSnapshots size cap", () => {
	it("caps a many-file PR: every frame stays within the file and line budget", () => {
		const { snapshots } = diffToSnapshots(manyFilesDiff(20));

		expect(snapshots.length).toBeGreaterThan(0);
		for (const snapshot of snapshots) {
			expect(codeLines(snapshot.code).length).toBeLessThanOrEqual(MAX_WALKTHROUGH_LINES);
			expect(headerLines(snapshot.code).length).toBeLessThanOrEqual(MAX_WALKTHROUGH_FILES);
		}
	});

	it("appends one omission marker, byte-identical across every staged frame", () => {
		const { snapshots } = diffToSnapshots(manyFilesDiff(20));
		const markers = markerOf(snapshots);

		expect(markers.size).toBe(1);
		expect([...markers][0]).toBe(`${ELLIPSIS} 14 more files`);
	});

	it("caps a single very tall hunk so no frame blows the line budget", () => {
		const { snapshots } = diffToSnapshots(oneTallFileDiff(200));

		expect(snapshots.length).toBeGreaterThan(0);
		for (const snapshot of snapshots) {
			expect(codeLines(snapshot.code).length).toBeLessThanOrEqual(MAX_WALKTHROUGH_LINES);
		}
		const markers = markerOf(snapshots);
		expect(markers.size).toBe(1);
		expect([...markers][0]).toBe(`${ELLIPSIS} more changes hidden`);
	});

	it("leaves a small multi-file diff untouched: no marker, no truncation", () => {
		const { snapshots } = diffToSnapshots(TWO_FILE_DIFF);

		for (const snapshot of snapshots) {
			expect(snapshot.code).not.toContain(`${ELLIPSIS} `);
			expect(snapshot.code).not.toContain("more file");
			expect(snapshot.code).toContain("// one.ts");
			expect(snapshot.code).toContain("// two.ts");
		}
	});
});

describe("the page cap", () => {
	/** Every `// path` header of a walkthrough, in the order its scenes show them. */
	const headersOf = (snapshots: CodeSnapshot[]) =>
		new Set(snapshots.flatMap((snapshot) => headerLines(snapshot.code)));

	it("keeps a walkthrough of a few hundred rows to 4 pages, and says what is left", () => {
		const { snapshots } = diffToSnapshots(oneTallFileDiff(400));

		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
		// One hunk, one stage per page, plus the page's own before-state when it has one.
		expect(snapshots.length).toBeLessThanOrEqual(MAX_WALKTHROUGH_PAGES * 2);
		expect(markerOf(snapshots).size).toBe(1);
		expect([...markerOf(snapshots)][0]).toBe(`${ELLIPSIS} more changes hidden`);
	});

	it("shows every file of a PR that fits the pages, with no marker", () => {
		const { snapshots } = diffToSnapshots(manyFilesDiff(MAX_WALKTHROUGH_FILES));

		expect(headersOf(snapshots).size).toBe(MAX_WALKTHROUGH_FILES);
		expect(markerOf(snapshots)).toEqual(new Set([undefined]));
	});

	it("cuts the pages when the scaffold of each (separators) pushes past the cap", () => {
		// 90 added rows fit the line budget (96) but not 4 pages: each page also
		// carries its `⋯` rows, so the fifth page is cut and the marker says so.
		const { snapshots } = diffToSnapshots(oneTallFileDiff(90));

		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
		expect(markerOf(snapshots).size).toBe(1);
		expect([...markerOf(snapshots)][0]).toBe(`${ELLIPSIS} more changes hidden`);
		expect(snapshots.length).toBeLessThanOrEqual(MAX_WALKTHROUGH_PAGES + 1);
	});

	it("counts the files a page cut hides, not only the ones the file cap dropped", () => {
		// Eight files of 14 added rows: the file cap drops two, and the six kept
		// (96 rows) fit the line budget, but each takes a page, so 4 pages show four
		// files and the marker owns up to the other four.
		const blocks: string[] = [];
		for (let k = 0; k < 8; k++) {
			blocks.push(`--- a/f${k}.ts`, `+++ b/f${k}.ts`, "@@ -1,2 +1,16 @@", " const first = 0;");
			for (let i = 0; i < 14; i++) {
				blocks.push(`+const f${k}r${i} = ${i};`);
			}
			blocks.push(" const last = 0;");
		}
		const { snapshots } = diffToSnapshots(nl(blocks));

		expect([...markerOf(snapshots)]).toEqual([`${ELLIPSIS} 4 more files`]);
		const shown = new Set(snapshots.flatMap((snapshot) => headerLines(snapshot.code)));
		expect(shown.size).toBe(MAX_WALKTHROUGH_PAGES);
	});

	it("holds a 246-file comparison to 4 pages, 11 steps or fewer, and counts the rest", () => {
		const blocks: string[] = [];
		for (let k = 0; k < 246; k++) {
			blocks.push(`--- a/f${k}.ts`, `+++ b/f${k}.ts`, "@@ -1,3 +1,3 @@", " const a = 1;");
			blocks.push(`-const b${k} = 2;`, `+const b${k} = 3;`, " const c = 3;");
		}
		const { snapshots } = diffToSnapshots(nl(blocks));

		expect(snapshots.length).toBeLessThanOrEqual(11);
		for (const snapshot of snapshots) {
			expect(snapshot.code.split("\n").length).toBeLessThanOrEqual(MAX_SCENE_LINES);
		}
		const marker = [...markerOf(snapshots)];
		expect(marker).toHaveLength(1);
		const hidden = Number(marker[0]?.match(/^⋯ (\d+) more files$/)?.[1]);
		const shown = new Set(snapshots.flatMap((snapshot) => headerLines(snapshot.code)));
		expect(hidden + shown.size).toBe(246);
	});
});
