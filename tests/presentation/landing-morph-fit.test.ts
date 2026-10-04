import {
	type MorphFit,
	fitMorphFontSize,
	refitMorphFont,
} from "@/presentation/landing/magic-move-section";
import { describe, expect, it } from "vitest";

/* #61: the morph frame held its code at 15px and scrolled what did not fit, so
   at 375px it cut 188px of the very tokens that move off the right edge, and the
   scroller became a keyboard tab stop with nothing to do in it. The code is
   sized to the frame instead, the way the Instrument's window already is. */
describe("morph frame fit", () => {
	it("keeps the designed size wherever the code fits", () => {
		// 459px of code at 15px is 30.6px of width per px of font.
		expect(fitMorphFontSize({ available: 520, naturalWidth: 459, naturalSize: 15, max: 15 })).toBe(
			15,
		);
	});

	it("shrinks the code to the frame, never past its edge", () => {
		const size = fitMorphFontSize({ available: 291, naturalWidth: 459, naturalSize: 15, max: 15 });

		expect(size).toBeLessThan(15);
		expect((459 / 15) * size).toBeLessThanOrEqual(291);
		expect(size).toBeGreaterThan(9);
	});

	it("does not depend on the size the code was measured at", () => {
		const fromFifteen = fitMorphFontSize({
			available: 291,
			naturalWidth: 459,
			naturalSize: 15,
			max: 15,
		});
		const fromNine = fitMorphFontSize({
			available: 291,
			naturalWidth: 459 * (9 / 15),
			naturalSize: 9,
			max: 15,
		});

		expect(fromNine).toBe(fromFifteen);
	});

	it("keeps the designed size before anything has been laid out", () => {
		expect(fitMorphFontSize({ available: 0, naturalWidth: 0, naturalSize: 15, max: 15 })).toBe(15);
	});
});

/* #125: on Chromium Linux the landing's section height stepped between three
   values every frame. The code is `width: 51ch`, and there Chromium snaps `ch`
   to whole pixels, so the drawn width is not proportional to the font size:
   measured at the size it had just been given, the fit gave a different size
   every pass. These are the widths that container drew, quarter pixel by
   quarter pixel from 8 to 15. */
const linuxDrawnWidth = (size: number) => 51 * Math.round(0.6 * size);
const macDrawnWidth = (size: number) => 51 * 0.6 * size;

/** Run the fit the way layout runs it: draw, measure, refit, until nothing changes. */
function settle(room: number, drawnWidth: (size: number) => number, from?: MorphFit) {
	let fit = from;
	let size = from?.size ?? 15;
	for (let pass = 0; pass < 40; pass++) {
		const next = refitMorphFont({
			fit,
			room,
			designedWidth: drawnWidth(15),
			drawnWidth: drawnWidth(size),
			max: 15,
		});
		if (next === fit) {
			return { size, rests: true };
		}
		fit = next;
		size = next.size;
	}
	return { size, rests: false };
}

describe("morph frame fit comes to rest", () => {
	it("settles on Chromium Linux at 1280 px, inside the frame", () => {
		const { size, rests } = settle(430, linuxDrawnWidth);

		expect(rests).toBe(true);
		expect(linuxDrawnWidth(size)).toBeLessThanOrEqual(430);
		expect(size).toBe(14);
	});

	it("settles on Chromium Linux at 375 px, and steps under a size that snaps wider than the frame", () => {
		const { size, rests } = settle(291, linuxDrawnWidth);

		expect(rests).toBe(true);
		expect(linuxDrawnWidth(size)).toBeLessThanOrEqual(291);
		expect(size).toBe(9);
	});

	it("keeps the sizes macOS draws (9.5 px at 375, 14 px at 1280, #61)", () => {
		expect(settle(291, macDrawnWidth)).toEqual({ size: 9.5, rests: true });
		expect(settle(430, macDrawnWidth)).toEqual({ size: 14, rests: true });
	});

	it("grows again when the room widens, a phone turned to landscape", () => {
		const phone = settle(291, linuxDrawnWidth);

		expect(settle(430, linuxDrawnWidth, { room: 291, size: phone.size }).size).toBe(14);
	});
});
