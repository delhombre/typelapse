import { gifFrameDelays, gifSafeFps } from "@/infrastructure/export/gif-timing";
import { describe, expect, it } from "vitest";

describe("gifSafeFps", () => {
	it("leaves a rate GIF can express alone", () => {
		expect(gifSafeFps(25)).toBe(25);
		expect(gifSafeFps(30)).toBe(30);
	});

	it("caps at 50, the fastest a two-centisecond delay can run", () => {
		// Below two centisecondes most decoders substitute a tenth of a second, so
		// a 60 fps GIF plays back *slower* than a 50 fps one. Asking for less is
		// how it ends up faster.
		expect(gifSafeFps(60)).toBe(50);
		expect(gifSafeFps(120)).toBe(50);
	});

	it("never returns a rate that would divide by zero", () => {
		expect(gifSafeFps(0)).toBe(1);
	});
});

describe("gifFrameDelays", () => {
	it("spends whole centiseconds that add up to the exact duration", () => {
		const delays = gifFrameDelays(30, 30);
		expect(delays).toHaveLength(30);
		expect(delays.reduce((a, b) => a + b, 0)).toBe(100);
	});

	it("alternates rather than rounding every frame the same way", () => {
		// 100/30 is 3.33 centisecondes: rounding each frame to 3 would lose 10% of
		// the running time by the end, so the remainder has to be carried.
		const delays = gifFrameDelays(30, 30);
		expect(new Set(delays)).toEqual(new Set([3, 4]));
	});

	it("is exact for a rate that divides cleanly", () => {
		expect(gifFrameDelays(25, 25)).toEqual(Array.from({ length: 25 }, () => 4));
	});

	it("keeps a short video's total honest too", () => {
		expect(gifFrameDelays(7, 30).reduce((a, b) => a + b, 0)).toBe(Math.round((7 / 30) * 100));
	});
});
