import { parseUnifiedDiff } from "@/application/diff/parse-unified-diff";
import { generateSnapshots, normalizeSnapshots } from "@/application/diff/snapshots";
import { describe, expect, it } from "vitest";

const nl = (lines: string[]) => lines.join("\n");

const TWO_HUNK_DIFF = nl([
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
]);

describe("generateSnapshots", () => {
	// These staging tests assert full-frame content via the `windowing: false`
	// escape hatch, so the sequencing logic reads clearly; windowed output has its
	// own coverage in windowing.test.ts and diff-to-snapshots.test.ts.
	it("before-after mode yields exactly two snapshots (full old, full new)", () => {
		const diff = parseUnifiedDiff(TWO_HUNK_DIFF);
		const snaps = generateSnapshots(diff, { mode: "before-after", windowing: false });

		expect(snaps).toHaveLength(2);
		expect(snaps[0]?.code).toBe(
			nl(["const a = 1;", "const b = 2;", "const c = 3;", "const e = 5;"]),
		);
		expect(snaps[1]?.code).toBe(
			nl(["const a = 1;", "const b = 20;", "const c = 3;", "const d = 4;", "const e = 5;"]),
		);
	});

	it("hunk-by-hunk mode yields N+1 snapshots, flipping one hunk per step", () => {
		const diff = parseUnifiedDiff(TWO_HUNK_DIFF);
		const snaps = generateSnapshots(diff, { mode: "hunk-by-hunk", windowing: false });

		// 2 hunks -> 3 snapshots: before, after-hunk-1, after-hunk-2 (== full after)
		expect(snaps).toHaveLength(3);

		// Stage 0: everything in its "before" state.
		expect(snaps[0]?.code).toBe(
			nl(["const a = 1;", "const b = 2;", "const c = 3;", "const e = 5;"]),
		);

		// Stage 1: first hunk applied, second hunk still "before".
		expect(snaps[1]?.code).toBe(
			nl(["const a = 1;", "const b = 20;", "const c = 3;", "const e = 5;"]),
		);

		// Stage 2: both hunks applied == full after.
		expect(snaps[2]?.code).toBe(
			nl(["const a = 1;", "const b = 20;", "const c = 3;", "const d = 4;", "const e = 5;"]),
		);
	});

	it("hunk-by-hunk with a single hunk equals before-after", () => {
		const diff = parseUnifiedDiff(
			nl(["--- a/x.ts", "+++ b/x.ts", "@@ -1 +1 @@", "-let x = 1;", "+let x = 2;"]),
		);

		expect(generateSnapshots(diff, { mode: "hunk-by-hunk" })).toHaveLength(2);
		expect(generateSnapshots(diff, { mode: "before-after" })).toHaveLength(2);
	});

	it("defaults to hunk-by-hunk mode", () => {
		const diff = parseUnifiedDiff(TWO_HUNK_DIFF);
		expect(generateSnapshots(diff)).toHaveLength(3);
	});

	it("windows each stage by default, splitting far-apart hunks with ⋯", () => {
		const diff = parseUnifiedDiff(TWO_HUNK_DIFF);
		const snaps = generateSnapshots(diff);

		// Windowed is the default: the two far-apart hunks are separated by a ⋯
		// in every stage, while the staging count and labels are untouched.
		expect(snaps).toHaveLength(3);
		for (const snap of snaps) {
			expect(snap.code).toContain("⋯");
		}
		expect(snaps.map((s) => s.label)).toEqual(["Before", "Change 1", "After"]);
	});

	it("carries a label per snapshot", () => {
		const diff = parseUnifiedDiff(TWO_HUNK_DIFF);
		const snaps = generateSnapshots(diff, { mode: "hunk-by-hunk" });
		expect(snaps[0]?.label).toBeDefined();
		expect(typeof snaps[0]?.label).toBe("string");
	});
});

describe("normalizeSnapshots", () => {
	it("drops snapshots whose code is empty or whitespace-only", () => {
		const result = normalizeSnapshots([{ code: "" }, { code: "   " }, { code: "const a = 1;" }]);
		expect(result).toHaveLength(1);
		expect(result[0]?.code).toBe("const a = 1;");
	});

	it("collapses consecutive duplicate snapshots", () => {
		const result = normalizeSnapshots([
			{ code: "a" },
			{ code: "a" },
			{ code: "b" },
			{ code: "b" },
			{ code: "a" },
		]);
		expect(result.map((s) => s.code)).toEqual(["a", "b", "a"]);
	});

	it("returns an empty array when nothing survives", () => {
		expect(normalizeSnapshots([{ code: "" }, { code: "  " }])).toEqual([]);
	});
});
