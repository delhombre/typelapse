/**
 * The code column's clip: which columns a window shows, and where the short
 * fade over the clipped edge starts and ends, in cells (ticket #174, decision
 * 2026-10-07-after-the-gate D1). One answer for the preview, the composition
 * and the painter, which draw it in their own units.
 */

import { LINE_FADE_CELLS, gutterColumnWidth, lineClip } from "@/application/layout/line-clip";
import { displayWidth } from "@/application/text/display-width";
import { describe, expect, it } from "vitest";

/** JetBrains Mono at 1080p: 14 px x 2.2 x 0.6. */
const CELL = 18.48;

describe("lineClip", () => {
	it("is null when the widest line fits the column", () => {
		expect(lineClip({ widestCells: 80, columnWidth: 80 * CELL, charWidth: CELL })).toBeNull();
		expect(lineClip({ widestCells: 40, columnWidth: 184.5 * CELL, charWidth: CELL })).toBeNull();
	});

	it("shows the whole columns before the clip edge and fades the last three of them", () => {
		expect(LINE_FADE_CELLS).toBe(3);
		expect(lineClip({ widestCells: 300, columnWidth: 3409.6, charWidth: CELL })).toEqual({
			visibleColumns: 184,
			fadeStart: 181,
			fadeEnd: 3409.6 / CELL,
		});
	});

	it("ends the fade on the clip edge, even between two cells", () => {
		const clip = lineClip({ widestCells: 120, columnWidth: 100.25 * CELL, charWidth: CELL });
		expect(clip?.visibleColumns).toBe(100);
		expect(clip?.fadeStart).toBe(97);
		expect(clip?.fadeEnd).toBeCloseTo(100.25, 9);
	});

	it("counts a column that lands on the edge to within a rounding error as visible", () => {
		// 3 x 18.48 in floating point is a hair under 55.44 / 18.48.
		const clip = lineClip({ widestCells: 10, columnWidth: 3 * CELL, charWidth: CELL });
		expect(clip?.visibleColumns).toBe(3);
		expect(clip?.fadeStart).toBe(0);
	});

	it("never starts the fade left of the code", () => {
		const clip = lineClip({ widestCells: 10, columnWidth: 2 * CELL, charWidth: CELL });
		expect(clip).toEqual({ visibleColumns: 2, fadeStart: 0, fadeEnd: 2 });
	});

	it("clips a line of ideographs on the cells it takes, not its characters", () => {
		const ascii = "x".repeat(300);
		const ideographs = "漢".repeat(150);
		expect(displayWidth(ideographs)).toBe(displayWidth(ascii));
		const column = { columnWidth: 184.5 * CELL, charWidth: CELL };
		expect(lineClip({ widestCells: displayWidth(ideographs), ...column })).toEqual(
			lineClip({ widestCells: displayWidth(ascii), ...column }),
		);
		// 92 ideographs (184 cells) would fit; the 93rd straddles the edge, under the fade.
		const straddling = "漢".repeat(93);
		const clip = lineClip({ widestCells: displayWidth(straddling), ...column });
		expect(clip?.visibleColumns).toBe(184);
		expect(clip?.fadeStart).toBeLessThanOrEqual(184);
	});

	it("leaves a column that holds 92 ideographs exactly alone", () => {
		expect(
			lineClip({
				widestCells: displayWidth("漢".repeat(92)),
				columnWidth: 184 * CELL,
				charWidth: CELL,
			}),
		).toBeNull();
	});
});

describe("gutterColumnWidth", () => {
	it("is nothing with line numbers off", () => {
		expect(
			gutterColumnWidth({ showLineNumbers: false, lastLine: 40, charWidth: CELL, fontSize: 30.8 }),
		).toBe(0);
	});

	it("is the DOM's box: two digits at least, plus the one-em gap", () => {
		// max(3 cells, 2 cells + 1 em) = max(55.44, 67.76).
		expect(
			gutterColumnWidth({ showLineNumbers: true, lastLine: 4, charWidth: CELL, fontSize: 30.8 }),
		).toBeCloseTo(67.76, 9);
		// Four digits: max(5 cells, 4 cells + 1 em) = max(92.4, 104.72).
		expect(
			gutterColumnWidth({ showLineNumbers: true, lastLine: 1200, charWidth: CELL, fontSize: 30.8 }),
		).toBeCloseTo(104.72, 9);
	});
});
