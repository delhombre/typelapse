import { fitCardToCanvas, tallestFrame, widestColumn } from "@/application/layout/canvas-fit";
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
		hasCaption: false,
		scale: 2.2,
		canvasMargin: 0.05,
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
			hasCaption: false,
			scale: 2.2,
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
