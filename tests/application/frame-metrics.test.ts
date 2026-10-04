import {
	LINE_HEIGHT_RATIO,
	chromeBarHeight,
	frameNaturalSize,
} from "@/application/layout/frame-metrics";
import { describe, expect, it } from "vitest";

/** Any measured advance will do; this one keeps the arithmetic in the comments. */
const CHAR_WIDTH_RATIO = 0.62;

describe("chromeBarHeight", () => {
	it("is zero when there is no chrome", () => {
		expect(chromeBarHeight("none", 2.2)).toBe(0);
	});

	it("scales linearly with the upscale factor", () => {
		expect(chromeBarHeight("macos", 2)).toBeCloseTo(2 * chromeBarHeight("macos", 1), 5);
	});

	it("gives each variant a positive, distinct bar height", () => {
		const macos = chromeBarHeight("macos", 1);
		const browser = chromeBarHeight("browser", 1);
		const terminal = chromeBarHeight("terminal", 1);
		expect(macos).toBeGreaterThan(0);
		expect(browser).toBeGreaterThan(0);
		expect(terminal).toBeGreaterThan(0);
		// The browser tab bar (pill address) is the tallest; the terminal bar the slimmest.
		expect(browser).toBeGreaterThan(macos);
		expect(macos).toBeGreaterThan(terminal);
	});
});

describe("frameNaturalSize", () => {
	const base = {
		chrome: "none" as const,
		maxCols: 10,
		maxLines: 5,
		fontSize: 10,
		padding: 20,
		showLineNumbers: false,
		lineNumberStart: 1,
		hasCaption: false,
		scale: 1,
		charWidthRatio: CHAR_WIDTH_RATIO,
	};

	it("computes width and height from the deterministic grid math", () => {
		// codeWidth = (10 + 2) * 10 * 0.62 = 74.4 ; width = 2*20 + 0 + 74.4
		// bodyHeight = 5 * 10 * 1.6 = 80 ; height = 2*20 + 80 (no chrome, no caption)
		const { width, height } = frameNaturalSize(base);
		expect(width).toBeCloseTo(40 + 12 * 10 * CHAR_WIDTH_RATIO, 5);
		expect(height).toBeCloseTo(40 + 5 * 10 * LINE_HEIGHT_RATIO, 5);
	});

	it("honours a measured advance when the target can measure its own font", () => {
		// The window has to be sized on the same advance the glyphs are painted with.
		const measured = frameNaturalSize({ ...base, charWidthRatio: 0.5 });
		expect(measured.width).toBeCloseTo(40 + 12 * 10 * 0.5, 5);
		expect(measured.height).toBeCloseTo(frameNaturalSize(base).height, 5);
	});

	it("widens for the line-number gutter", () => {
		const withGutter = frameNaturalSize({ ...base, showLineNumbers: true });
		// gutterDigits = max(2, "5".length) = 2 ; gutterWidth = 3*10*0.62 + 10 = 28.6
		expect(withGutter.width).toBeCloseTo(frameNaturalSize(base).width + 28.6, 5);
		expect(withGutter.height).toBeCloseTo(frameNaturalSize(base).height, 5);
	});

	it("grows the gutter when the last line number needs more digits", () => {
		const small = frameNaturalSize({ ...base, showLineNumbers: true, maxLines: 5 });
		const big = frameNaturalSize({
			...base,
			showLineNumbers: true,
			maxLines: 120,
			lineNumberStart: 1,
		});
		// 120 lines → 3-digit gutter → one extra char of width.
		expect(big.width).toBeCloseTo(small.width + 10 * CHAR_WIDTH_RATIO, 5);
	});

	it("taller for more lines", () => {
		const short = frameNaturalSize(base).height;
		const tall = frameNaturalSize({ ...base, maxLines: 40 }).height;
		expect(tall).toBeCloseTo(short + 35 * 10 * LINE_HEIGHT_RATIO, 5);
	});

	it("adds the chrome bar to the height", () => {
		const withChrome = frameNaturalSize({ ...base, chrome: "macos" });
		expect(withChrome.height).toBeCloseTo(
			frameNaturalSize(base).height + chromeBarHeight("macos", 1),
			5,
		);
	});

	it("adds the caption block below the card", () => {
		const withCaption = frameNaturalSize({ ...base, hasCaption: true });
		// StepCaption: marginTop 14 + minHeight 20 = 34, scaled.
		expect(withCaption.height).toBeCloseTo(frameNaturalSize(base).height + 34, 5);
	});

	it("scales the caption block with the upscale factor", () => {
		const s = 2.2;
		const withCaption = frameNaturalSize({ ...base, hasCaption: true, scale: s });
		const without = frameNaturalSize({ ...base, scale: s });
		expect(withCaption.height - without.height).toBeCloseTo(34 * s, 5);
	});
});
