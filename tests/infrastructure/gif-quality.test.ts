import { GIF_MAX_EDGE, gifDimensions, orderedDither } from "@/infrastructure/export/gif-quality";
import { describe, expect, it } from "vitest";

describe("gifDimensions", () => {
	it("leaves a frame that is already small enough alone", () => {
		expect(gifDimensions(640, 360)).toEqual({ width: 640, height: 360, scaled: false });
	});

	it("brings a 1080p frame down to the long edge, keeping the aspect", () => {
		const { width, height } = gifDimensions(1920, 1080);
		expect(width).toBe(GIF_MAX_EDGE);
		expect(width / height).toBeCloseTo(1920 / 1080, 2);
	});

	it("caps the tall edge of a portrait frame, not the width", () => {
		const { width, height } = gifDimensions(1080, 1920);
		expect(height).toBe(GIF_MAX_EDGE);
		expect(width / height).toBeCloseTo(1080 / 1920, 2);
	});

	it("keeps both axes even, so a downscale never lands on a half pixel", () => {
		const { width, height } = gifDimensions(1079, 1921);
		expect(width % 2).toBe(0);
		expect(height % 2).toBe(0);
	});

	it("says whether it changed anything, so the panel can say so too", () => {
		expect(gifDimensions(1920, 1080).scaled).toBe(true);
		expect(gifDimensions(640, 360).scaled).toBe(false);
	});
});

describe("orderedDither", () => {
	const flat = () => {
		const pixels = new Uint8ClampedArray(8 * 8 * 4);
		for (let i = 0; i < pixels.length; i += 4) {
			pixels[i] = 100;
			pixels[i + 1] = 100;
			pixels[i + 2] = 100;
			pixels[i + 3] = 255;
		}
		return pixels;
	};

	it("spreads a flat colour across a range a palette can straddle", () => {
		const out = orderedDither(flat(), 8, 8);
		const reds = new Set([...out].filter((_, i) => i % 4 === 0));

		// A flat block comes back as a spread of values: that spread is what a
		// quantiser turns into two neighbouring palette entries instead of one
		// hard edge, which is the whole point.
		expect(reds.size).toBeGreaterThan(1);
	});

	it("never moves a channel more than the threshold amplitude", () => {
		const out = orderedDither(flat(), 8, 8);
		for (let i = 0; i < out.length; i += 4) {
			expect(Math.abs((out[i] ?? 0) - 100)).toBeLessThanOrEqual(8);
		}
	});

	it("leaves alpha untouched: a GIF's transparency is one bit, not a gradient", () => {
		const out = orderedDither(flat(), 8, 8);
		for (let i = 3; i < out.length; i += 4) {
			expect(out[i]).toBe(255);
		}
	});

	it("clamps rather than wrapping at the ends of the range", () => {
		const black = new Uint8ClampedArray(8 * 8 * 4);
		const out = orderedDither(black, 8, 8);
		for (const value of out) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(255);
		}
	});

	it("is a function of position, so two identical frames dither identically", () => {
		expect([...orderedDither(flat(), 8, 8)]).toEqual([...orderedDither(flat(), 8, 8)]);
	});
});
