import {
	ASPECT_LABELS,
	type AspectLabel,
	RESOLUTION_TIERS,
	RenderConfig,
	type ResolutionTier,
	dimensionsFor,
	presetFor,
} from "@/domain/entities/render-config";
import { describe, expect, it } from "vitest";

describe("RenderConfig", () => {
	it("creates a config with explicit dimensions", () => {
		const config = RenderConfig.create({ width: 1920, height: 1080, fps: 60, format: "mp4" });

		expect(config.width).toBe(1920);
		expect(config.height).toBe(1080);
		expect(config.fps).toBe(60);
		expect(config.format).toBe("mp4");
	});

	it("defaults to 1080p 16:9 at 60fps in mp4", () => {
		const config = RenderConfig.defaults();

		expect(config.width).toBe(1920);
		expect(config.height).toBe(1080);
		expect(config.fps).toBe(60);
		expect(config.format).toBe("mp4");
	});

	it("rejects non-positive dimensions, fps and unknown formats", () => {
		expect(() => RenderConfig.create({ width: 0, height: 1080, fps: 60, format: "mp4" })).toThrow(
			"Dimensions must be positive",
		);
		expect(() => RenderConfig.create({ width: 1920, height: 1080, fps: 0, format: "mp4" })).toThrow(
			"FPS must be positive",
		);
		expect(() =>
			// biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard
			RenderConfig.create({ width: 1920, height: 1080, fps: 60, format: "avi" as any }),
		).toThrow(/Invalid format/);
	});

	/**
	 * H.264 (and every encoder we target) needs even pixel dimensions: an odd
	 * edge is a render that fails deep inside ffmpeg rather than at the boundary.
	 */
	it("rejects odd dimensions, which no encoder we target accepts", () => {
		expect(() =>
			RenderConfig.create({ width: 1921, height: 1080, fps: 60, format: "mp4" }),
		).toThrow("Dimensions must be even");
		expect(() =>
			RenderConfig.create({ width: 1920, height: 1081, fps: 60, format: "mp4" }),
		).toThrow("Dimensions must be even");
	});

	it("rejects fractional dimensions", () => {
		expect(() =>
			RenderConfig.create({ width: 1920.5, height: 1080, fps: 60, format: "mp4" }),
		).toThrow("Dimensions must be even");
	});
});

describe("resolution tiers", () => {
	it("names the short edge, the way every platform quotes a resolution", () => {
		// 1080p vertical is 1080 wide, not 1080 tall: the tier is the short edge.
		expect(RESOLUTION_TIERS).toEqual(["1080p", "1440p", "4K"]);
		expect(dimensionsFor("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
		expect(dimensionsFor("16:9", "1080p")).toEqual({ width: 1920, height: 1080 });
	});

	/**
	 * The full matrix. Short edge is 1080 / 1440 / 2160; the long edge follows the
	 * aspect ratio. Every cell is even, so every cell is encodable.
	 *
	 *          | 1080p       | 1440p       | 4K
	 *   16:9   | 1920 x 1080 | 2560 x 1440 | 3840 x 2160
	 *   1:1    | 1080 x 1080 | 1440 x 1440 | 2160 x 2160
	 *   9:16   | 1080 x 1920 | 1440 x 2560 | 2160 x 3840
	 *   4:5    | 1080 x 1350 | 1440 x 1800 | 2160 x 2700
	 *   3:4    | 1080 x 1440 | 1440 x 1920 | 2160 x 2880
	 */
	const MATRIX: Record<AspectLabel, Record<ResolutionTier, [number, number]>> = {
		"16:9": { "1080p": [1920, 1080], "1440p": [2560, 1440], "4K": [3840, 2160] },
		"1:1": { "1080p": [1080, 1080], "1440p": [1440, 1440], "4K": [2160, 2160] },
		"9:16": { "1080p": [1080, 1920], "1440p": [1440, 2560], "4K": [2160, 3840] },
		"4:5": { "1080p": [1080, 1350], "1440p": [1440, 1800], "4K": [2160, 2700] },
		"3:4": { "1080p": [1080, 1440], "1440p": [1440, 1920], "4K": [2160, 2880] },
	};

	for (const aspect of ASPECT_LABELS) {
		for (const tier of RESOLUTION_TIERS) {
			it(`computes ${aspect} at ${tier}`, () => {
				const [width, height] = MATRIX[aspect][tier];
				expect(dimensionsFor(aspect, tier)).toEqual({ width, height });
			});
		}
	}

	it("produces even dimensions for every combination", () => {
		for (const aspect of ASPECT_LABELS) {
			for (const tier of RESOLUTION_TIERS) {
				const { width, height } = dimensionsFor(aspect, tier);
				expect(width % 2, `${aspect} ${tier} width`).toBe(0);
				expect(height % 2, `${aspect} ${tier} height`).toBe(0);
			}
		}
	});

	it("keeps every combination inside the 3840px encoder ceiling", () => {
		for (const aspect of ASPECT_LABELS) {
			for (const tier of RESOLUTION_TIERS) {
				const { width, height } = dimensionsFor(aspect, tier);
				expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
			}
		}
	});

	it("holds the aspect ratio it claims", () => {
		expect(dimensionsFor("4:5", "4K").width / dimensionsFor("4:5", "4K").height).toBeCloseTo(
			4 / 5,
			6,
		);
		expect(
			dimensionsFor("16:9", "1440p").width / dimensionsFor("16:9", "1440p").height,
		).toBeCloseTo(16 / 9, 6);
	});

	it("builds a valid RenderConfig from any preset combination", () => {
		for (const aspect of ASPECT_LABELS) {
			for (const tier of RESOLUTION_TIERS) {
				const { width, height } = dimensionsFor(aspect, tier);
				expect(() => RenderConfig.create({ width, height, fps: 60, format: "mp4" })).not.toThrow();
			}
		}
	});
});

describe("presetFor", () => {
	it("recognises every cell of the matrix from raw dimensions", () => {
		for (const aspect of ASPECT_LABELS) {
			for (const tier of RESOLUTION_TIERS) {
				const { width, height } = dimensionsFor(aspect, tier);
				expect(presetFor(width, height)).toEqual({ aspect, tier });
			}
		}
	});

	it("returns null for dimensions that match no preset", () => {
		expect(presetFor(1234, 567)).toBeNull();
		// A plan-clamped 4K 16:9 export lands off-matrix; the UI must not lie
		// about which chip is selected.
		expect(presetFor(1920, 1200)).toBeNull();
	});
});
