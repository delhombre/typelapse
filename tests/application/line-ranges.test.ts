import {
	firstLinePastEnd,
	focusLineSet,
	formatLineRanges,
	parseLineRanges,
	readLineRanges,
} from "@/application/focus/line-ranges";
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

	it("refuses reversed bounds instead of rewriting them", () => {
		expect(parseLineRanges("5-2")).toBeNull();
		expect(parseLineRanges("4-2")).toBeNull();
	});

	it("refuses line 0 instead of rewriting it to line 1", () => {
		expect(parseLineRanges("0")).toBeNull();
		expect(parseLineRanges("0-3")).toBeNull();
	});

	it("clamps to the step's line count when it is given", () => {
		expect(shape(parseLineRanges("1-1000000", 5))).toEqual([[1, 5]]);
		expect(shape(parseLineRanges("3, 4-99", 5))).toEqual([
			[3, 3],
			[4, 5],
		]);
	});

	it("refuses a range that starts past the last line", () => {
		expect(parseLineRanges("9", 5)).toBeNull();
		expect(parseLineRanges("9-12", 5)).toBeNull();
	});

	it("survives a number too large to be an integer", () => {
		expect(shape(parseLineRanges(`1-${"9".repeat(40)}`, 5))).toEqual([[1, 5]]);
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
		expect(parseLineRanges("1-2-3")).toBeNull();
	});
});

describe("readLineRanges (what a file, a draft or a link already holds)", () => {
	it("keeps a range past the step's last line: the clamp is at use, not on open", () => {
		expect(formatLineRanges(readLineRanges("2, 8-10") ?? [])).toBe("2, 8-10");
		expect(formatLineRanges(readLineRanges("1-1000000") ?? [])).toBe("1-1000000");
	});

	it("normalizes a reversed range instead of erasing it", () => {
		expect(shape(readLineRanges("5-2"))).toEqual([[2, 5]]);
	});

	it("keeps line 0 as it was written; focusLineSet lights nothing for it", () => {
		const ranges = readLineRanges("0") ?? [];
		expect(formatLineRanges(ranges)).toBe("0");
		expect(focusLineSet(ranges, 5).size).toBe(0);
	});

	it("reads nothing from what is not line numbers", () => {
		expect(readLineRanges("abc")).toBeNull();
		expect(readLineRanges("")).toEqual([]);
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
		const set = focusLineSet(
			[
				HighlightRange.create({ startLine: 2, endLine: 4 }),
				HighlightRange.create({ startLine: 7, endLine: 7 }),
			],
			10,
		);
		expect([...set].sort((a, b) => a - b)).toEqual([2, 3, 4, 7]);
	});

	it("is empty for no ranges", () => {
		expect(focusLineSet([], 10).size).toBe(0);
	});

	it("stops at the step's last line, however far the range reaches", () => {
		const set = focusLineSet([HighlightRange.create({ startLine: 1, endLine: 1_000_000 })], 5);
		expect([...set]).toEqual([1, 2, 3, 4, 5]);
	});

	it("drops a range that starts past the last line", () => {
		const set = focusLineSet([HighlightRange.create({ startLine: 9, endLine: 12 })], 5);
		expect(set.size).toBe(0);
	});

	it("never holds more lines than the step has", () => {
		const set = focusLineSet(
			[HighlightRange.create({ startLine: 0, endLine: Number.MAX_SAFE_INTEGER })],
			3,
		);
		expect([...set]).toEqual([1, 2, 3]);
	});
});

describe("firstLinePastEnd", () => {
	it("names the line a refusal is about when only the last line is the problem", () => {
		expect(firstLinePastEnd("9", 5)).toBe(9);
		expect(firstLinePastEnd("2, 9-12", 5)).toBe(9);
	});

	it("stays silent for what the field would accept or refuse for another reason", () => {
		expect(firstLinePastEnd("2-4", 5)).toBeNull();
		expect(firstLinePastEnd("1-99", 5)).toBeNull();
		expect(firstLinePastEnd("abc", 5)).toBeNull();
		expect(firstLinePastEnd("0", 5)).toBeNull();
		expect(firstLinePastEnd("5-2", 5)).toBeNull();
		expect(firstLinePastEnd("abc, 9", 5)).toBeNull();
	});
});
