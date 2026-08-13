import { gifFrameDelays, gifSafeFps } from "@/infrastructure/export/gif-timing";
import { describe, expect, it } from "vitest";

describe("gifSafeFps", () => {
	it("leaves a rate GIF can express alone", () => {
		expect(gifSafeFps(15)).toBe(15);
		expect(gifSafeFps(20)).toBe(20);
	});

	it("caps at 20, because a GIF's bytes are better spent on pixels", () => {
		// Two centiseconds is the fastest delay a decoder reliably honours, which
		// makes 50 the format's ceiling — but a GIF that runs at 50 spends its
		// whole budget on frames nobody perceives. Measured on the same 5.8 s
		// export: 640 px at 50 fps is 14.98 MB, 960 px at 20 fps is 11.98 MB.
		// Fewer frames, 2.25x the pixels, and a smaller file. Code is read, not
		// watched: the resolution is what carries it.
		expect(gifSafeFps(60)).toBe(20);
		expect(gifSafeFps(120)).toBe(20);
		expect(gifSafeFps(30)).toBe(20);
	});

	it("still leaves a rate below the cap alone, so a slow ask stays slow", () => {
		expect(gifSafeFps(12)).toBe(12);
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
