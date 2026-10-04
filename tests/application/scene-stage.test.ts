import {
	CARD_SLOT,
	DESKTOP_SCENE_MIN_WIDTH,
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
