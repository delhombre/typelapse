import { concentric } from "@/application/layout/concentric";
import { describe, expect, it } from "vitest";

describe("concentric", () => {
	it("keeps a square window square: a zero inner radius stays sharp", () => {
		// A soft outer corner around a sharp window reads incoherent, so radius 0
		// must yield 0 no matter how wide the gap is.
		expect(concentric(0, 32)).toBe(0);
		expect(concentric(0, 0)).toBe(0);
	});

	it("adds the gap to the inner radius in the normal case", () => {
		// Both corners share one center: outer = inner + gap.
		expect(concentric(8, 32)).toBe(40);
		expect(concentric(12, 24)).toBe(36);
		expect(concentric(16, 16)).toBe(32);
	});

	it("guards a negative inner radius to a sharp corner", () => {
		// A radius can never be below zero; degrade to sharp rather than invert.
		expect(concentric(-5, 32)).toBe(0);
	});

	it("guards a negative gap by clamping it to zero", () => {
		// The outer corner can never be tighter than the inner one it wraps.
		expect(concentric(8, -5)).toBe(8);
	});
});
