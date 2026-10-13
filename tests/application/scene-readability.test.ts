import {
	MIN_READABLE_CODE_PX,
	effectiveCodePx,
	measureScenes,
} from "@/application/layout/scene-readability";
import { describe, expect, it } from "vitest";

const LANDSCAPE = { width: 1920, height: 1080 };
const PORTRAIT = { width: 1080, height: 1920 };

describe("measureScenes", () => {
	it("reads the line count of every scene and the longest line in display cells", () => {
		const measured = measureScenes(["a\nbb", "ccc\n\nworld", "世界"]);

		expect(measured.lineCounts).toEqual([2, 3, 1]);
		expect(measured.longestLine).toBe(5);
	});
});

describe("effectiveCodePx", () => {
	it("is 30.8 px for a card that fits whole at 1080p (14 px type at the 2.2 video scale)", () => {
		expect(effectiveCodePx({ lineCounts: [3], longestLine: 20, canvas: LANDSCAPE })).toBeCloseTo(
			30.8,
			6,
		);
	});

	it("is set by the tallest scene, since one card serves every scene", () => {
		const tall = effectiveCodePx({ lineCounts: [10, 56], longestLine: 40, canvas: LANDSCAPE });
		const alone = effectiveCodePx({ lineCounts: [56], longestLine: 40, canvas: LANDSCAPE });

		expect(tall).toBeCloseTo(alone, 9);
		expect(tall).toBeLessThan(
			effectiveCodePx({ lineCounts: [10], longestLine: 40, canvas: LANDSCAPE }),
		);
	});

	it("shrinks with a caption band, which the card budgets under the window", () => {
		const bare = effectiveCodePx({ lineCounts: [40], longestLine: 40, canvas: LANDSCAPE });
		const captioned = effectiveCodePx({
			lineCounts: [40],
			longestLine: 40,
			canvas: LANDSCAPE,
			captions: ["Change 1"],
		});

		expect(captioned).toBeLessThan(bare);
	});

	it("is set by the width on a portrait canvas, where a long line is the limit", () => {
		const narrow = effectiveCodePx({ lineCounts: [10], longestLine: 40, canvas: PORTRAIT });
		const wide = effectiveCodePx({ lineCounts: [10], longestLine: 80, canvas: PORTRAIT });

		expect(wide).toBeLessThan(narrow);
	});

	it("never goes under the 8 px floor the three renderers share", () => {
		expect(effectiveCodePx({ lineCounts: [3000], longestLine: 300, canvas: LANDSCAPE })).toBe(8);
	});

	it("scales with the canvas tier: 4K draws the same card at twice the pixels", () => {
		const hd = effectiveCodePx({ lineCounts: [30], longestLine: 60, canvas: LANDSCAPE });
		const uhd = effectiveCodePx({
			lineCounts: [30],
			longestLine: 60,
			canvas: { width: 3840, height: 2160 },
		});

		expect(uhd).toBeCloseTo(hd * 2, 6);
	});
});

describe("MIN_READABLE_CODE_PX", () => {
	it("is the 18 px a viewer reads on a phone at 1080p", () => {
		expect(MIN_READABLE_CODE_PX).toBe(18);
	});
});
