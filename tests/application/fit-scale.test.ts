import { fitScale } from "@/application/layout/fit-scale";
import { describe, expect, it } from "vitest";

describe("fitScale", () => {
	it("never enlarges — a card smaller than the box stays at scale 1", () => {
		expect(fitScale(400, 300, 800, 600)).toBe(1);
	});

	it("is height-bound when the card is too tall", () => {
		// 900px tall card into a 450px box → halve it; width has room.
		expect(fitScale(400, 900, 800, 450)).toBeCloseTo(0.5, 5);
	});

	it("is width-bound when the card is too wide", () => {
		// 1600px wide card into an 800px box → halve it; height has room.
		expect(fitScale(1600, 300, 800, 600)).toBeCloseTo(0.5, 5);
	});

	it("takes the tighter of the two axes", () => {
		// width ratio 0.5, height ratio 0.25 → the smaller wins.
		expect(fitScale(1600, 1200, 800, 300)).toBeCloseTo(0.25, 5);
	});

	it("returns exactly 1 when the card matches the box", () => {
		expect(fitScale(800, 600, 800, 600)).toBe(1);
	});

	it("guards non-positive natural dimensions", () => {
		expect(fitScale(0, 300, 800, 600)).toBe(1);
		expect(fitScale(400, 0, 800, 600)).toBe(1);
		expect(fitScale(-5, -5, 800, 600)).toBe(1);
	});

	it("guards non-positive available dimensions", () => {
		expect(fitScale(400, 300, 0, 600)).toBe(1);
		expect(fitScale(400, 300, 800, 0)).toBe(1);
		expect(fitScale(400, 300, -10, -10)).toBe(1);
	});
});
