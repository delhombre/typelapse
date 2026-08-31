import {
	DEFAULT_TRANSITION_EASING,
	TRANSITION_EASING_PRESETS,
	cubicBezierAt,
	isCubicBezier,
} from "@/application/magic-move/easing";
import { describe, expect, it } from "vitest";

describe("cubic-bezier transition easing", () => {
	it("copies the six useful ui.camera presets exactly", () => {
		expect(TRANSITION_EASING_PRESETS.map(({ id, value }) => [id, value])).toEqual([
			["linear", [0, 0, 1, 1]],
			["ease", [0.25, 0.1, 0.25, 1]],
			["ease-in", [0.42, 0, 1, 1]],
			["ease-out", [0, 0, 0.58, 1]],
			["ease-in-out", [0.42, 0, 0.58, 1]],
			["smooth", [0.22, 1, 0.36, 1]],
		]);
		expect(DEFAULT_TRANSITION_EASING).toEqual([0.42, 0, 0.58, 1]);
	});

	it("solves x before returning y instead of treating the parameter as time", () => {
		const ease = TRANSITION_EASING_PRESETS.find(({ id }) => id === "ease")?.value;
		if (!ease) {
			throw new Error("Ease preset missing");
		}

		expect(cubicBezierAt(ease, 0)).toBe(0);
		expect(cubicBezierAt(ease, 1)).toBe(1);
		expect(cubicBezierAt(ease, 0.5)).toBeCloseTo(0.8024, 3);
	});

	it("keeps linear motion linear and clamps progress at both ends", () => {
		const linear = [0, 0, 1, 1] as const;

		expect(cubicBezierAt(linear, -1)).toBe(0);
		expect(cubicBezierAt(linear, 0.25)).toBeCloseTo(0.25, 5);
		expect(cubicBezierAt(linear, 0.75)).toBeCloseTo(0.75, 5);
		expect(cubicBezierAt(linear, 2)).toBe(1);
	});

	it("accepts only finite four-point curves with CSS-valid x controls", () => {
		expect(isCubicBezier([0.42, 0, 0.58, 1])).toBe(true);
		expect(isCubicBezier([-0.1, 0, 0.58, 1])).toBe(false);
		expect(isCubicBezier([0.42, 0, 1.1, 1])).toBe(false);
		expect(isCubicBezier([0.42, Number.NaN, 0.58, 1])).toBe(false);
		expect(isCubicBezier([0.42, 0, 0.58])).toBe(false);
	});
});
