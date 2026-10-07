import {
	BASE_VIDEO_SCALE,
	MIN_TEXT_PX,
	REFERENCE_SHORT_EDGE,
} from "@/application/layout/canvas-fit";
import {
	CARD_SLOT,
	DESKTOP_SCENE_MIN_WIDTH,
	DOCK_CLEARANCE,
	MIN_DOCK_GAP,
	REFERENCE_EDITOR_FONT_PX,
	SHELL_SQUEEZE_FROM,
	SHELL_SQUEEZE_RANGE,
	STAGE_FLOOR_HEIGHT,
	dockTransform,
	pictureHeightAt,
	shellMinHeightAt,
	stageBandsAt,
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

describe("the bands that give way before the shell scrolls", () => {
	it("keeps the comfortable bands from the height the short-window rule starts at", () => {
		expect(stageBandsAt(SHELL_SQUEEZE_FROM + SHELL_SQUEEZE_RANGE)).toEqual({
			padTop: 10,
			padBottom: 60,
			frameInset: 32,
		});
		expect(stageBandsAt(900)).toEqual(stageBandsAt(SHELL_SQUEEZE_FROM + SHELL_SQUEEZE_RANGE));
	});

	it("shrinks them to their named minimum at the height where scrolling begins", () => {
		expect(stageBandsAt(SHELL_SQUEEZE_FROM)).toEqual({
			padTop: 0,
			padBottom: 40,
			frameInset: 16,
		});
		expect(stageBandsAt(300)).toEqual(stageBandsAt(SHELL_SQUEEZE_FROM));
	});

	it("moves them smoothly between the two, never growing as the window shrinks", () => {
		let previous = stageBandsAt(SHELL_SQUEEZE_FROM + SHELL_SQUEEZE_RANGE);
		for (
			let height = SHELL_SQUEEZE_FROM + SHELL_SQUEEZE_RANGE;
			height >= SHELL_SQUEEZE_FROM;
			height -= 5
		) {
			const bands = stageBandsAt(height);
			expect(bands.padTop).toBeLessThanOrEqual(previous.padTop);
			expect(bands.padBottom).toBeLessThanOrEqual(previous.padBottom);
			expect(bands.frameInset).toBeLessThanOrEqual(previous.frameInset);
			previous = bands;
		}
	});

	it("never scrolls a window of 650px or more, the 1366x768 laptop's browser among them", () => {
		for (let height = SHELL_SQUEEZE_FROM; height <= 760; height += 1) {
			expect(shellMinHeightAt(height), `a ${height}px window`).toBeLessThanOrEqual(height);
		}
	});

	it("never takes the picture under its floor until the window is shorter than it needs", () => {
		for (let height = SHELL_SQUEEZE_FROM; height <= 760; height += 1) {
			expect(pictureHeightAt(height), `a ${height}px window`).toBeGreaterThanOrEqual(
				STAGE_FLOOR_HEIGHT,
			);
		}
	});

	it("scrolls below the least the shell can be, which is at most the height it squeezes to", () => {
		expect(shellMinHeightAt(500)).toBeLessThanOrEqual(SHELL_SQUEEZE_FROM);
		expect(shellMinHeightAt(500)).toBeGreaterThan(500);
		expect(pictureHeightAt(500)).toBeGreaterThanOrEqual(STAGE_FLOOR_HEIGHT);
	});

	it("leaves the dock a clear gap above the picture however far it squeezes", () => {
		for (const height of [SHELL_SQUEEZE_FROM, 700, 760]) {
			const { padBottom, frameInset } = stageBandsAt(height);
			expect(
				padBottom + frameInset - DOCK_CLEARANCE,
				`a ${height}px window`,
			).toBeGreaterThanOrEqual(MIN_DOCK_GAP);
		}
	});

	it("does not touch a window the short-window rule never reaches", () => {
		// 1440x780 and 1440x900 are byte-identical to main: the tall shell's own bands.
		expect(shellMinHeightAt(781)).toBe(757);
		expect(shellMinHeightAt(900)).toBe(757);
	});
});
