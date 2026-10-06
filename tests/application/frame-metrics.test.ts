import {
	CAPTION_LINE_HEIGHT,
	CAPTION_MARGIN_TOP,
	LINE_HEIGHT_RATIO,
	captionBandLines,
	captionBlockHeight,
	captionLines,
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
		captions: [],
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
		const withCaption = frameNaturalSize({ ...base, captions: ["Reads the config"] });
		// StepCaption: marginTop 14 + one line of 20 = 34, scaled.
		expect(withCaption.captionLines).toBe(1);
		expect(withCaption.height).toBeCloseTo(frameNaturalSize(base).height + 34, 5);
	});

	it("scales the caption block with the upscale factor", () => {
		const s = 2.2;
		// A target at scale s sizes its type and padding by s too, which is what
		// keeps a caption's line count the same at every scale.
		const scaled = { ...base, fontSize: base.fontSize * s, padding: base.padding * s, scale: s };
		const withCaption = frameNaturalSize({ ...scaled, captions: ["Reads the config"] });
		const without = frameNaturalSize(scaled);
		expect(withCaption.height - without.height).toBeCloseTo(34 * s, 5);
	});

	it("adds a second line to the band when a caption wraps on this card", () => {
		const narrow = { ...base, maxCols: 8 };
		const long = ["Sanity checks the reconciled workspace membership invitations table."];
		const withCaption = frameNaturalSize({ ...narrow, captions: long });

		expect(withCaption.captionLines).toBe(2);
		expect(withCaption.height).toBeCloseTo(frameNaturalSize(narrow).height + 54, 5);
	});

	it("reserves the longest caption's lines for the whole video, blanks ignored", () => {
		const narrow = { ...base, maxCols: 8 };
		const mixed = [
			"",
			"Short",
			"Sanity checks the reconciled workspace membership invitations table.",
		];
		expect(frameNaturalSize({ ...narrow, captions: mixed }).captionLines).toBe(2);
		expect(frameNaturalSize({ ...narrow, captions: ["", " "] }).captionLines).toBe(0);
	});
});

describe("captionLines", () => {
	const EIGHTY = "Sanity checks the reconciled workspace membership invitations table.".padEnd(
		80,
		".",
	);

	it("is 0 for no caption and 1 for one that fits", () => {
		expect(captionLines("", 400, 1)).toBe(0);
		expect(captionLines("   ", 400, 1)).toBe(0);
		expect(captionLines("Reads the config", 400, 1)).toBe(1);
	});

	it("takes 2 lines for the 80-character caption on a narrow card, and never a third", () => {
		expect(captionLines(EIGHTY, 221, 1)).toBe(2);
		expect(captionLines(EIGHTY, 100, 1)).toBe(2);
		expect(captionLines("x".repeat(500), 200, 1)).toBe(2);
	});

	it("gives the same answer at every scale of the same card", () => {
		for (const unit of [1, 2.2, 3]) {
			expect(captionLines(EIGHTY, 221 * unit, unit)).toBe(captionLines(EIGHTY, 221, 1));
		}
	});

	it("counts capitals and digits wider than lowercase prose", () => {
		// 33 characters is 252px of Inter Medium at 13px in capitals: it needs two
		// lines on a 221px window, where the same count in lowercase fits one.
		expect(captionLines("WARNING: DO NOT MERGE THIS BRANCH", 221, 1)).toBe(2);
		expect(captionLines("warning: do not merge this branch", 221, 1)).toBe(1);
		expect(captionLines("Ship v2.0.1 on 12/10/2026 at 09:30", 221, 1)).toBe(2);
	});

	it("counts a wide glyph as two cells", () => {
		const wide = "世".repeat(20);
		expect(captionLines(wide, 150, 1)).toBeGreaterThan(captionLines("a".repeat(20), 150, 1));
	});

	it("takes the longest of the video's captions for the band", () => {
		expect(captionBandLines(["", "Short", EIGHTY], 221, 1)).toBe(2);
		expect(captionBandLines(["", "Short"], 221, 1)).toBe(1);
		expect(captionBandLines([], 221, 1)).toBe(0);
	});

	it("budgets a band of the margin plus its lines", () => {
		expect(captionBlockHeight(0, 2)).toBe(0);
		expect(captionBlockHeight(1, 2)).toBe(2 * (CAPTION_MARGIN_TOP + CAPTION_LINE_HEIGHT));
		expect(captionBlockHeight(2, 2)).toBe(2 * (CAPTION_MARGIN_TOP + 2 * CAPTION_LINE_HEIGHT));
	});
});
