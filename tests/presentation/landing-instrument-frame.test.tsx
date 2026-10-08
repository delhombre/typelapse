import { frameBox, frameClip } from "@/presentation/landing/instrument";
import { describe, expect, it } from "vitest";

/* D8: the aspect change animated the frame's width and height, which laid the
   stage out on every frame of the spring (172 Layout events in one change,
   measured from a trace). The frame is now one box that never resizes, the
   size of every ratio at once, and the ratio is a clip on it. */
describe("instrument frame", () => {
	it("is one box large enough for every ratio", () => {
		// 16:9 is the widest (636 of the stage's 636), 9:16 the tallest (366).
		expect(frameBox(1)).toEqual({ w: 636, h: 366 });
		expect(frameBox(0.5)).toEqual({ w: 318, h: 183 });
	});

	it("clips the box to the ratio's frame, centred, with the frame's radius", () => {
		// 9:16 in the 636 × 366 box: 205.875 wide, so 215.0625 off each side.
		expect(frameClip({ w: 636, h: 366 }, { w: 205.875, h: 366 }, 18)).toBe(
			"inset(0px 215.0625px 0px 215.0625px round 18px)",
		);
		expect(frameClip({ w: 636, h: 366 }, { w: 636, h: 357.75 }, 18)).toBe(
			"inset(4.125px 0px 4.125px 0px round 18px)",
		);
	});

	it("never clips past the box while a spring overshoots", () => {
		expect(frameClip({ w: 100, h: 100 }, { w: 104, h: 90 }, 18)).toBe(
			"inset(5px 0px 5px 0px round 18px)",
		);
	});
});
