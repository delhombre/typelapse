import {
	fitCardToCanvas,
	renderScaleFor,
	tallestFrame,
	widestColumn,
} from "@/application/layout/canvas-fit";
import { fitScale } from "@/application/layout/fit-scale";
import { frameNaturalSize } from "@/application/layout/frame-metrics";
import { describe, expect, it } from "vitest";

const plan = {
	frames: [
		{
			lineCount: 3,
			tokens: [
				{ col: 0, content: "const" },
				{ col: 6, content: "x = 1" },
			],
		},
		{ lineCount: 5, tokens: [{ col: 0, content: "function foo() {" }] },
	],
};

describe("widestColumn", () => {
	it("returns the widest col + length across every frame", () => {
		// frame 1: max(0+5, 6+5)=11; frame 2: 0+16=16.
		expect(widestColumn(plan)).toBe(16);
	});

	it("returns 0 for a plan with no tokens", () => {
		expect(widestColumn({ frames: [] })).toBe(0);
	});

	it("counts a token's display cells, so a wide glyph widens the card by two", () => {
		const wide = { frames: [{ lineCount: 1, tokens: [{ col: 4, content: '"世界 🚀"' }] }] };
		// quote + 2 ideographs (4) + space + rocket (2) + quote = 9 cells, not 7 code units.
		expect(widestColumn(wide)).toBe(4 + 9);
	});
});

describe("tallestFrame", () => {
	it("returns the tallest frame's line count", () => {
		expect(tallestFrame(plan)).toBe(5);
	});

	it("returns at least 1 for an empty plan", () => {
		expect(tallestFrame({ frames: [] })).toBe(1);
	});
});

describe("fitCardToCanvas", () => {
	const base = {
		plan,
		chrome: "macos" as const,
		fontSize: 14,
		padding: 24,
		cardMargin: 32,
		showLineNumbers: true,
		lineNumberStart: 1,
		captions: [],
		scale: 2.2,
		canvasMargin: 0.05,
		charWidthRatio: 0.6,
	};

	it("mirrors frameNaturalSize + fitScale of the padded card (single source of truth)", () => {
		const canvasWidth = 1080;
		const canvasHeight = 1920;
		const fit = fitCardToCanvas({ ...base, canvasWidth, canvasHeight });

		const natural = frameNaturalSize({
			chrome: "macos",
			maxCols: 16,
			maxLines: 5,
			fontSize: 14 * 2.2,
			padding: 24 * 2.2,
			showLineNumbers: true,
			lineNumberStart: 1,
			captions: [],
			scale: 2.2,
			charWidthRatio: 0.6,
		});
		const cardPadding = 32 * 2.2;
		const paddedW = natural.width + 2 * cardPadding;
		const paddedH = natural.height + 2 * cardPadding;
		const expectedScale = fitScale(paddedW, paddedH, canvasWidth * 0.9, canvasHeight * 0.9);

		expect(fit.natural.width).toBeCloseTo(natural.width, 6);
		expect(fit.natural.height).toBeCloseTo(natural.height, 6);
		expect(fit.scale).toBeCloseTo(expectedScale, 6);
		expect(fit.widthFraction).toBeCloseTo((paddedW * expectedScale) / canvasWidth, 6);
		expect(fit.heightFraction).toBeCloseTo((paddedH * expectedScale) / canvasHeight, 6);
	});

	it("keeps both fractions within (0, 1]", () => {
		const fit = fitCardToCanvas({ ...base, canvasWidth: 1080, canvasHeight: 1920 });
		for (const fraction of [fit.widthFraction, fit.heightFraction]) {
			expect(fraction).toBeGreaterThan(0);
			expect(fraction).toBeLessThanOrEqual(1);
		}
	});

	it("leaves a few-line card wide and short in a 9:16 canvas (mesh margins top and bottom)", () => {
		const fit = fitCardToCanvas({ ...base, canvasWidth: 1080, canvasHeight: 1920 });
		expect(fit.widthFraction).toBeGreaterThan(fit.heightFraction);
		// A short snippet must not fill the tall canvas: room stays for the safe zones.
		expect(fit.heightFraction).toBeLessThan(0.6);
	});

	it("grows the height fraction as the snippet gets taller (approaches the safe zones)", () => {
		const short = fitCardToCanvas({ ...base, canvasWidth: 1080, canvasHeight: 1920 });
		const tallPlan = { frames: [{ lineCount: 40, tokens: [{ col: 0, content: "x" }] }] };
		const tall = fitCardToCanvas({
			...base,
			plan: tallPlan,
			canvasWidth: 1080,
			canvasHeight: 1920,
		});
		expect(tall.heightFraction).toBeGreaterThan(short.heightFraction);
	});
});

describe("renderScaleFor", () => {
	it("is the base scale at 1080p, on either orientation", () => {
		// The reference tier. Existing 1080p exports must not shift by a pixel.
		expect(renderScaleFor(1920, 1080, 2.2)).toBeCloseTo(2.2, 10);
		expect(renderScaleFor(1080, 1920, 2.2)).toBeCloseTo(2.2, 10);
		expect(renderScaleFor(1080, 1080, 2.2)).toBeCloseTo(2.2, 10);
	});

	it("grows with the short edge, so a tier buys pixels and not a smaller card", () => {
		expect(renderScaleFor(2560, 1440, 2.2)).toBeCloseTo(2.2 * (1440 / 1080), 10);
		expect(renderScaleFor(3840, 2160, 2.2)).toBeCloseTo(4.4, 10);
		expect(renderScaleFor(2160, 3840, 2.2)).toBeCloseTo(4.4, 10);
	});

	it("falls back to the base scale on degenerate canvases", () => {
		expect(renderScaleFor(0, 1080, 2.2)).toBe(2.2);
		expect(renderScaleFor(1920, -1, 2.2)).toBe(2.2);
	});
});

/**
 * The point of the whole exercise: a resolution tier must change how MANY pixels
 * the card is drawn with, never how much of the frame it occupies. Without the
 * proportional scale, the 4K card lands at half the framing of the 1080p one.
 */
describe("framing is resolution-independent", () => {
	const base = {
		plan,
		chrome: "macos" as const,
		fontSize: 14,
		padding: 24,
		cardMargin: 32,
		showLineNumbers: true,
		lineNumberStart: 1,
		captions: [],
		canvasMargin: 0.05,
		charWidthRatio: 0.6,
	};

	const fitAt = (canvasWidth: number, canvasHeight: number) =>
		fitCardToCanvas({
			...base,
			scale: renderScaleFor(canvasWidth, canvasHeight, 2.2),
			canvasWidth,
			canvasHeight,
		});

	it("keeps the same canvas fraction across every tier of one aspect", () => {
		const hd = fitAt(1920, 1080);
		const qhd = fitAt(2560, 1440);
		const uhd = fitAt(3840, 2160);

		expect(qhd.widthFraction).toBeCloseTo(hd.widthFraction, 10);
		expect(uhd.widthFraction).toBeCloseTo(hd.widthFraction, 10);
		expect(qhd.heightFraction).toBeCloseTo(hd.heightFraction, 10);
		expect(uhd.heightFraction).toBeCloseTo(hd.heightFraction, 10);
	});

	it("draws the 4K card at exactly twice the pixels of the 1080p one", () => {
		const hd = fitAt(1920, 1080);
		const uhd = fitAt(3840, 2160);
		expect(uhd.natural.width * uhd.scale).toBeCloseTo(2 * hd.natural.width * hd.scale, 6);
		expect(uhd.natural.height * uhd.scale).toBeCloseTo(2 * hd.natural.height * hd.scale, 6);
	});

	it("holds for a vertical aspect too", () => {
		const hd = fitAt(1080, 1920);
		const uhd = fitAt(2160, 3840);
		expect(uhd.widthFraction).toBeCloseTo(hd.widthFraction, 10);
		expect(uhd.heightFraction).toBeCloseTo(hd.heightFraction, 10);
	});
});

/**
 * A long line is clipped at the floor's column limit, never fit (ticket #174,
 * decision 2026-10-07-after-the-gate D1). The limit is the window the readable
 * floor gives a canvas as wide as its short edge (9:16, 1:1, 4:5, 3:4): 1637
 * editor px with these settings. A 16:9 canvas used to fit a 300-character line
 * at 9 px, a hair above the 8 px floor: an unreadable strip.
 */
describe("a line longer than the floor's columns", () => {
	const settings = {
		chrome: "macos" as const,
		fontSize: 14,
		padding: 24,
		cardMargin: 32,
		showLineNumbers: true,
		lineNumberStart: 1,
		captions: [],
		canvasMargin: 0.05,
		charWidthRatio: 0.6,
	};
	const line = (content: string) => ({
		frames: [{ lineCount: 4, tokens: [{ col: 0, content }] }],
	});
	const fitAt = (content: string, canvasWidth: number, canvasHeight: number) =>
		fitCardToCanvas({
			...settings,
			plan: line(content),
			scale: renderScaleFor(canvasWidth, canvasHeight, 2.2),
			canvasWidth,
			canvasHeight,
		});

	it("leaves an 80-character line exactly as main fit it", () => {
		const natural = { width: 1707.2000000000003, height: 390.39000000000004, captionLines: 0 };
		expect(fitAt("x".repeat(80), 1920, 1080)).toEqual({
			natural,
			windowHeight: 390.39000000000004,
			captionLines: 0,
			clip: null,
			lineClip: null,
			scale: 0.9350649350649349,
			widthFraction: 0.9,
			heightFraction: 0.4599047619047619,
		});
		expect(fitAt("x".repeat(80), 1080, 1920)).toEqual({
			natural,
			windowHeight: 390.39000000000004,
			captionLines: 0,
			clip: null,
			lineClip: null,
			scale: 0.5259740259740259,
			widthFraction: 0.8999999999999999,
			heightFraction: 0.14551674107142856,
		});
	});

	it("draws a 300-character line on 16:9 in the floor's window, at 14 px, not a 9 px strip", () => {
		const fit = fitAt("x".repeat(300), 1920, 1080);
		// The window 9:16 gets at the 8 px floor: 1637 editor px, 3601.4 at 1080p.
		expect(fit.natural.width).toBeCloseTo(3601.4, 9);
		expect(fit.scale).toBeCloseTo(1728 / 3742.2, 9);
		expect(14 * 2.2 * fit.scale).toBeCloseTo(14.22, 2);
		expect(fit.clip).toEqual({ right: true, bottom: false });
		// Code column: 3601.4 less the padding (2 x 52.8) and the gutter (67.76).
		expect(fit.lineClip).toEqual({
			visibleColumns: 185,
			fadeStart: 182,
			fadeEnd: expect.closeTo(3428.04 / 18.48, 9),
		});
	});

	it("draws the same line at the floor on 9:16, through the same columns", () => {
		const tall = fitAt("x".repeat(300), 1080, 1920);
		const wide = fitAt("x".repeat(300), 1920, 1080);
		expect(tall.scale).toBeCloseTo(8 / 30.8, 12);
		expect(tall.natural.width).toBeCloseTo(wide.natural.width, 9);
		expect(tall.lineClip).toEqual(wide.lineClip);
	});

	it("frames the clip identically at every tier", () => {
		const hd = fitAt("x".repeat(10_000), 1920, 1080);
		const uhd = fitAt("x".repeat(10_000), 3840, 2160);
		expect(uhd.scale).toBeCloseTo(hd.scale, 12);
		expect(uhd.natural.width).toBeCloseTo(2 * hd.natural.width, 9);
		expect(uhd.lineClip?.visibleColumns).toBe(hd.lineClip?.visibleColumns);
	});

	it("clips a line of 150 ideographs where it clips 300 ASCII characters", () => {
		const ascii = fitAt("x".repeat(300), 1920, 1080);
		const ideographs = fitAt("漢".repeat(150), 1920, 1080);
		expect(ideographs.scale).toBe(ascii.scale);
		expect(ideographs.lineClip).toEqual(ascii.lineClip);
	});
});
