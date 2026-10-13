import { readFileSync } from "node:fs";
import {
	MAX_DIFF_STEPS,
	MAX_SCENE_LINES,
	capWalkthrough,
	chapterSequences,
	diffToSnapshots,
} from "@/application/diff";
import type { CodeSnapshot } from "@/application/diff";
import { describe, expect, it } from "vitest";
import { manyHunks } from "../support/many-hunks";

/**
 * The measurement behind MAX_DIFF_STEPS (PR #305): what each kind of import
 * stages, what the cap keeps, and how long that plays (1.85 n - 0.65 s at the
 * default timing). Every row is reproducible from this file and the committed
 * fixtures, so the table in the decision log can be checked, not trusted.
 */

const seconds = (steps: number) => Math.round((1.85 * steps - 0.65) * 10) / 10;
const chapters = (count: number, hunks: number) =>
	Array.from({ length: count }, (_, index) => ({
		title: `commit ${index + 1}`,
		diffText: manyHunks(`file${index}.ts`, hunks),
	}));
const rowsOf = (snapshots: CodeSnapshot[]) =>
	Math.max(...snapshots.map((snapshot) => snapshot.code.split("\n").length));

const SINGLE: Array<[string, string, number, number]> = [
	[
		"hono#5189 (the hero's example PR)",
		readFileSync("tests/fixtures/hono-pr-5189.diff", "utf8"),
		7,
		7,
	],
	["12 hunks, 1 file", manyHunks("a.ts", 12), 13, 13],
	["25 hunks, 1 file", manyHunks("a.ts", 25), 28, 16],
	["45 hunks, 1 file", manyHunks("a.ts", 45), 48, 16],
	["300 hunks, 1 file", manyHunks("a.ts", 300), 48, 16],
];

describe("what a single diff stages and the cap keeps", () => {
	it.each(SINGLE)("%s", (_name, diffText, staged, kept) => {
		const cut = capWalkthrough([diffToSnapshots(diffText).snapshots]);

		expect(cut.shownSteps + cut.omittedSteps).toBe(staged);
		expect(cut.shownSteps).toBe(kept);
		expect(seconds(cut.shownSteps)).toBeLessThan(30);
		expect(rowsOf(cut.snapshots)).toBeLessThanOrEqual(MAX_SCENE_LINES);
	});

	it("keeps the longest example whole and the longest cut at 29.0 s", () => {
		expect(seconds(7)).toBe(12.3);
		expect(seconds(MAX_DIFF_STEPS)).toBe(29);
	});
});

const CHAPTERED: Array<[string, number, number, number, number]> = [
	["3 commits x 6 hunks", 3, 6, 19, 13],
	["2 commits x 45 hunks", 2, 45, 95, 16],
	["4 commits x 45 hunks", 4, 45, 189, 16],
	["10 commits x 45 hunks", 10, 45, 471, 16],
];

describe("what a pull request chaptered by commit stages and the cap keeps", () => {
	it.each(CHAPTERED)("%s", (_name, count, hunks, staged, kept) => {
		const cut = capWalkthrough(chapterSequences(chapters(count, hunks)));

		expect(cut.shownSteps + cut.omittedSteps).toBe(staged);
		expect(cut.shownSteps).toBe(kept);
		expect(rowsOf(cut.snapshots)).toBeLessThanOrEqual(MAX_SCENE_LINES);
	});
});
