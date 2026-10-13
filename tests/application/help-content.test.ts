import { formatLineRanges, parseLineRanges } from "@/application/focus/line-ranges";
import {
	DOCS_HREF,
	FOCUS_EXAMPLE,
	SCENE_LINES,
	focusExampleLines,
	focusExampleMeaning,
	sayLines,
} from "@/application/help/help-content";
import { describe, expect, it } from "vitest";

describe("the Help sheet's focus example", () => {
	it("is a string the Focus lines field takes, and means the ranges the sheet shows", () => {
		const ranges = parseLineRanges(FOCUS_EXAMPLE);
		expect(ranges?.map((range) => [range.startLine, range.endLine])).toEqual([
			[2, 4],
			[7, 7],
		]);
	});

	it("is already in the field's own spelling, so typing it changes nothing", () => {
		const ranges = parseLineRanges(FOCUS_EXAMPLE) ?? [];
		expect(formatLineRanges(ranges)).toBe(FOCUS_EXAMPLE);
	});

	it("lights lines 2, 3, 4 and 7, and says so from the parse and not from a copy", () => {
		expect(FOCUS_EXAMPLE).toBe("2-4, 7");
		expect(focusExampleLines()).toEqual([2, 3, 4, 7]);
		expect(focusExampleMeaning()).toBe("keeps lines 2, 3, 4 and 7 bright.");
	});
});

describe("sayLines", () => {
	it("joins numbers the way a person says them", () => {
		expect(sayLines([])).toBe("");
		expect(sayLines([5])).toBe("5");
		expect(sayLines([2, 7])).toBe("2 and 7");
		expect(sayLines([2, 3, 4, 7])).toBe("2, 3, 4 and 7");
	});
});

describe("the Help sheet's words", () => {
	it("explains scenes in three lines", () => {
		expect(SCENE_LINES).toHaveLength(3);
	});

	it("uses no dash for a pause, and no tooltip-only text", () => {
		for (const line of SCENE_LINES) {
			expect(line).not.toMatch(/[–—]/);
		}
	});

	it("points at the landing's How it works section, which exists", () => {
		expect(DOCS_HREF).toBe("/#how-it-works");
	});
});
