import { fitSceneSurface } from "@/application/layout/fit-scene-surface";
import { describe, expect, it } from "vitest";

describe("fitSceneSurface", () => {
	it("centers the authored canvas without changing its aspect ratio", () => {
		expect(fitSceneSurface({ width: 1920, height: 1080 }, { width: 1000, height: 700 })).toEqual({
			scale: 1000 / 1920,
			x: 0,
			y: (700 - 1080 * (1000 / 1920)) / 2,
			width: 1000,
			height: 1080 * (1000 / 1920),
		});
	});

	it("fails on invalid source or target geometry", () => {
		expect(() => fitSceneSurface({ width: 0, height: 1080 }, { width: 100, height: 100 })).toThrow(
			"Scene surface dimensions must be positive",
		);
		expect(() => fitSceneSurface({ width: 1920, height: 1080 }, { width: 100, height: 0 })).toThrow(
			"Scene viewport dimensions must be positive",
		);
	});
});
