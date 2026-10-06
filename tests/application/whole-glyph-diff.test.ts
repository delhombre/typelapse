/**
 * The character diff behind the magic-move keys works on UTF-16 code units, so
 * `🚀` → `😀` (which share their high surrogate) came back as "equal `\ud83d`,
 * then changed": the keyer split the token there and each renderer drew half
 * an emoji. The cleanup moves every diff edge onto a glyph edge in both codes.
 */

import { type TextEdit, keepGlyphsWhole } from "@/application/magic-move/whole-glyph-diff";
import { describe, expect, it } from "vitest";

function sides(diffs: TextEdit[]): { from: string; to: string } {
	return {
		from: diffs
			.filter(([op]) => op !== 1)
			.map(([, text]) => text)
			.join(""),
		to: diffs
			.filter(([op]) => op !== -1)
			.map(([, text]) => text)
			.join(""),
	};
}

describe("keepGlyphsWhole", () => {
	it("leaves a diff whose edges already fall between glyphs as it is", () => {
		const diffs: TextEdit[] = [
			[0, "const "],
			[-1, "a"],
			[1, "b"],
			[0, " = 1;"],
		];
		expect(keepGlyphsWhole(diffs)).toEqual(diffs);
	});

	it("gives a shared high surrogate back to both sides of the edit", () => {
		// "🚀" is 🚀 and "😀" is 😀.
		const diffs: TextEdit[] = [
			[0, 'a = "\ud83d'],
			[-1, "\ude80"],
			[1, "\ude00"],
			[0, '";'],
		];
		expect(keepGlyphsWhole(diffs)).toEqual([
			[0, 'a = "'],
			[-1, "🚀"],
			[1, "😀"],
			[0, '";'],
		]);
	});

	it("keeps an accent with the letter it sits on", () => {
		const diffs: TextEdit[] = [
			[0, "cafe"],
			[-1, "́"],
			[1, "̀"],
			[0, " ok"],
		];
		expect(keepGlyphsWhole(diffs)).toEqual([
			[0, "caf"],
			[-1, "é"],
			[1, "è"],
			[0, " ok"],
		]);
	});

	it("does not keep an equal stretch that starts inside a joined emoji", () => {
		// 👨‍👩 against 👨‍👧: the trailing equality would start mid-sequence.
		const diffs: TextEdit[] = [
			[0, "x👨‍"],
			[-1, "👩"],
			[1, "👧"],
			[0, "y"],
		];
		const cleaned = keepGlyphsWhole(diffs);
		expect(cleaned).toEqual([
			[0, "x"],
			[-1, "👨‍👩"],
			[1, "👨‍👧"],
			[0, "y"],
		]);
		expect(sides(cleaned)).toEqual(sides(diffs));
	});

	it("never changes either code the diff spells", () => {
		const diffs: TextEdit[] = [
			[1, "\ud83d"],
			[0, "\ude80"],
			[-1, "x"],
			[0, "z"],
		];
		const cleaned = keepGlyphsWhole(diffs);
		expect(sides(cleaned)).toEqual(sides(diffs));
		for (const [op, text] of cleaned) {
			if (op === 0) {
				expect(text).not.toMatch(/^[\udc00-\udfff]/);
			}
		}
	});
});
