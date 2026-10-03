import { fitMorphFontSize } from "@/presentation/landing/magic-move-section";
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
