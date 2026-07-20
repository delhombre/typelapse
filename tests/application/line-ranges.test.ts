import { focusLineSet, formatLineRanges, parseLineRanges } from "@/application/focus/line-ranges";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { describe, expect, it } from "vitest";

/** Compact a range list to [startLine, endLine] pairs for structural assertions. */
function shape(ranges: readonly HighlightRange[] | null): number[][] | null {
	return ranges === null ? null : ranges.map((r) => [r.startLine, r.endLine]);
}

describe("parseLineRanges", () => {
	it("parses a single line into a one-line range", () => {
		expect(shape(parseLineRanges("7"))).toEqual([[7, 7]]);
	});

	it("parses a dash range", () => {
		expect(shape(parseLineRanges("2-4"))).toEqual([[2, 4]]);
	});

	it("parses mixed comma-separated ranges and tolerates surrounding spaces", () => {
		expect(shape(parseLineRanges(" 2-4 , 7 "))).toEqual([
			[2, 4],
			[7, 7],
		]);
	});

	it("normalizes reversed bounds", () => {
		expect(shape(parseLineRanges("4-2"))).toEqual([[2, 4]]);
	});

	it("clamps line numbers to at least 1", () => {
		expect(shape(parseLineRanges("0-3"))).toEqual([[1, 3]]);
		expect(shape(parseLineRanges("0"))).toEqual([[1, 1]]);
	});

	it("returns an empty array for blank input (no focus)", () => {
		expect(shape(parseLineRanges(""))).toEqual([]);
		expect(shape(parseLineRanges("   "))).toEqual([]);
	});

	it("skips empty chunks between commas", () => {
		expect(shape(parseLineRanges("2, ,4"))).toEqual([
			[2, 2],
			[4, 4],
		]);
	});

	it("returns null for non-numeric or malformed input", () => {
		expect(parseLineRanges("abc")).toBeNull();
		expect(parseLineRanges("2-x")).toBeNull();
		expect(parseLineRanges("2-")).toBeNull();
	});
});

describe("formatLineRanges", () => {
	it("round-trips a parsed input back to its canonical form", () => {
		const ranges = parseLineRanges("2-4, 7");
		expect(ranges).not.toBeNull();
		expect(formatLineRanges(ranges ?? [])).toBe("2-4, 7");
	});

	it("collapses a single-line range to one number", () => {
		expect(formatLineRanges([HighlightRange.create({ startLine: 5, endLine: 5 })])).toBe("5");
	});

	it("formats an empty list as an empty string", () => {
		expect(formatLineRanges([])).toBe("");
	});
});

describe("focusLineSet", () => {
	it("expands ranges into a set of 1-indexed lines", () => {
		const set = focusLineSet([
			HighlightRange.create({ startLine: 2, endLine: 4 }),
			HighlightRange.create({ startLine: 7, endLine: 7 }),
		]);
		expect([...set].sort((a, b) => a - b)).toEqual([2, 3, 4, 7]);
	});

	it("is empty for no ranges", () => {
		expect(focusLineSet([]).size).toBe(0);
	});
});
