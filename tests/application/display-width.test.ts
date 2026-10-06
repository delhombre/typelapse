/**
 * How many monospace cells a piece of text takes, the way a terminal counts
 * them: East Asian wide and fullwidth characters and emoji take two, combining
 * marks and joiners take none, everything else one. The magic-move grid places
 * tokens by this count, so a wide glyph is never painted over by the next token.
 */

import {
	cellRuns,
	codePointWidth,
	displayWidth,
	glyphBoundary,
} from "@/application/text/display-width";
import { describe, expect, it } from "vitest";

const cp = (char: string): number => char.codePointAt(0) ?? 0;

describe("codePointWidth", () => {
	it("counts printable ASCII and Latin letters as one cell", () => {
		for (const char of ["a", "Z", "0", " ", ";", '"', "~", "é", "ï", "ß", "λ", "Ж"]) {
			expect(codePointWidth(cp(char)), char).toBe(1);
		}
	});

	it("counts CJK ideographs, kana and Hangul as two cells", () => {
		for (const char of ["こ", "ん", "世", "界", "カ", "한", "語", "。", "、", "　"]) {
			expect(codePointWidth(cp(char)), char).toBe(2);
		}
	});

	it("counts fullwidth forms as two cells", () => {
		for (const char of ["Ａ", "１", "！", "￥"]) {
			expect(codePointWidth(cp(char)), char).toBe(2);
		}
	});

	it("counts emoji with an emoji presentation as two cells", () => {
		for (const char of ["🚀", "😀", "🔥", "🎉", "🦀", "🧪", "⚡", "✅", "⭐", "⌛"]) {
			expect(codePointWidth(cp(char)), char).toBe(2);
		}
	});

	it("counts combining marks, joiners and variation selectors as zero cells", () => {
		for (const point of [0x0301, 0x0308, 0x20e3, 0x200b, 0x200d, 0xfe0f, 0xfe0e, 0xfeff]) {
			expect(codePointWidth(point), point.toString(16)).toBe(0);
		}
	});
});

describe("displayWidth", () => {
	it("is the string length for ASCII", () => {
		expect(displayWidth('const msg = "hello";')).toBe(20);
		expect(displayWidth("")).toBe(0);
	});

	it("iterates by code point, so an astral emoji (two UTF-16 units) is two cells, not four", () => {
		expect("🚀".length).toBe(2);
		expect(displayWidth("🚀")).toBe(2);
	});

	it("counts the sample string with wide characters twice", () => {
		// 7 CJK (14) + space + rocket (2) + space + "naïve café" (10)
		expect(displayWidth("こんにちは世界 🚀 naïve café")).toBe(28);
	});

	it("puts a decomposed accent on its base letter", () => {
		expect(displayWidth("café")).toBe(4);
	});

	it("draws a zero-width-joiner sequence as the one glyph it is", () => {
		// man, ZWJ, woman, ZWJ, girl: one family glyph.
		expect(displayWidth("👨‍👩‍👧")).toBe(2);
	});

	it("widens a text-default symbol that asks for emoji presentation", () => {
		expect(displayWidth("❤")).toBe(1);
		expect(displayWidth("❤️")).toBe(2);
	});

	it("keeps a skin-tone modifier on its emoji", () => {
		expect(displayWidth("👍🏽")).toBe(2);
	});

	it("reads a pair of regional indicators as one flag", () => {
		expect(displayWidth("🇫🇷")).toBe(2);
		expect(displayWidth("🇫🇷🇯🇵")).toBe(4);
	});
});

describe("glyphBoundary", () => {
	it("leaves an index between two glyphs where it is", () => {
		expect(glyphBoundary("abc", 2)).toBe(2);
		expect(glyphBoundary("a🚀b", 3)).toBe(3);
	});

	it("moves an index inside a glyph to the glyph's end", () => {
		expect(glyphBoundary("a🚀b", 2)).toBe(3);
		expect(glyphBoundary("café!", 4)).toBe(5);
		expect(glyphBoundary("x👨‍👩y", 3)).toBe(6);
	});

	it("clamps to the text", () => {
		expect(glyphBoundary("ab", -1)).toBe(0);
		expect(glyphBoundary("ab", 9)).toBe(2);
	});
});

describe("cellRuns", () => {
	it("keeps an all-narrow text as one run", () => {
		expect(cellRuns("naïve café")).toEqual([
			{ text: "naïve café", col: 0, cells: 10, wide: false },
		]);
	});

	it("gives each wide glyph a run of its own at its cell column", () => {
		expect(cellRuns('"世界 🚀 ok"')).toEqual([
			{ text: '"', col: 0, cells: 1, wide: false },
			{ text: "世", col: 1, cells: 2, wide: true },
			{ text: "界", col: 3, cells: 2, wide: true },
			{ text: " ", col: 5, cells: 1, wide: false },
			{ text: "🚀", col: 6, cells: 2, wide: true },
			{ text: ' ok"', col: 8, cells: 4, wide: false },
		]);
	});

	it("keeps a joined emoji sequence whole", () => {
		expect(cellRuns("a👨‍👩‍👧b")).toEqual([
			{ text: "a", col: 0, cells: 1, wide: false },
			{ text: "👨‍👩‍👧", col: 1, cells: 2, wide: true },
			{ text: "b", col: 3, cells: 1, wide: false },
		]);
	});

	it("is empty for an empty text", () => {
		expect(cellRuns("")).toEqual([]);
	});
});
