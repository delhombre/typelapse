import {
	BASE_VIDEO_SCALE,
	MIN_TEXT_PX,
	REFERENCE_SHORT_EDGE,
} from "@/application/layout/canvas-fit";
import {
	CARD_SLOT,
	DESKTOP_SCENE_MIN_WIDTH,
	REFERENCE_EDITOR_FONT_PX,
	STAGE_FLOOR_HEIGHT,
	dockTransform,
	stageTransform,
} from "@/application/layout/scene-stage";
import { describe, expect, it } from "vitest";

describe("the scene's stage geometry", () => {
	it("enters the desktop scene only when the editor and stage both fit", () => {
		expect(DESKTOP_SCENE_MIN_WIDTH).toBe(1280);
		expect(DESKTOP_SCENE_MIN_WIDTH).toBeGreaterThan(CARD_SLOT * 2);
	});

	it("moves the stage beside the editor while the card is open", () => {
		expect(stageTransform({ folded: false })).toEqual({
			x: CARD_SLOT / 2,
			y: 0,
			scale: 0.9,
		});
	});

	it("keeps the stage on the page centre when Preview owns the screen", () => {
		// Opening Edit reveals a temporary sheet and shifts the picture just enough
		// to preserve the relationship; Preview itself stays on the page centre.
		expect(stageTransform({ folded: true }).x).toBe(0);
	});

	it("keeps the same edit layout once motion has been declined", () => {
		const transform = stageTransform({ folded: false }, true);
		expect(transform).toEqual({
			x: CARD_SLOT / 2,
			y: 0,
			scale: 0.9,
		});
	});

	it("keeps the dock on the stage's centre line", () => {
		expect(dockTransform({ folded: false })).toEqual({
			x: CARD_SLOT / 2,
		});
		expect(dockTransform({ folded: true })).toEqual({ x: 0 });
	});
});

describe("the stage's floor", () => {
	// The stage was fit into whatever the window left it: 1440x500 gave a 128 by
	// 72 picture, under the 8px code text the exporters already refuse to draw.
	it("is the picture height where the studio's own code type is still readable", () => {
		const textAt = (height: number) =>
			(height / REFERENCE_SHORT_EDGE) * REFERENCE_EDITOR_FONT_PX * BASE_VIDEO_SCALE;

		expect(textAt(STAGE_FLOOR_HEIGHT)).toBeGreaterThanOrEqual(MIN_TEXT_PX);
		expect(textAt(STAGE_FLOOR_HEIGHT - 1)).toBeLessThan(MIN_TEXT_PX);
	});

	it("is a whole number of pixels, so the shell's minimum height is too", () => {
		expect(Number.isInteger(STAGE_FLOOR_HEIGHT)).toBe(true);
	});

	it("still fits the picture of a laptop window, so only a short window scrolls", () => {
		// 1440x780 gives the picture 304px today.
		expect(STAGE_FLOOR_HEIGHT).toBeLessThan(304);
	});
});
