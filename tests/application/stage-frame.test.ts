import { STAGE_TOP_GAP, phoneSheetGeometry } from "@/application/layout/phone-sheet";
import {
	DESKTOP_SCENE_MIN_WIDTH,
	STAGE_FLOOR_HEIGHT,
	pictureHeightAt,
} from "@/application/layout/scene-stage";
import { type FrameBox, stageFrameBox } from "@/application/layout/stage-frame";
import { describe, expect, it } from "vitest";

/**
 * Where the studio draws its default 16:9 frame, as a pure function of the
 * window. The boot skeleton draws its frame from it, so what replaces the
 * outline settles into the same box instead of resizing on arrival (#226: the
 * skeleton's 692x390 became the studio's 576x324 at 1280x800).
 *
 * The expected boxes are measured off the real studio's `preview-frame`
 * (tests/e2e/studio-boot-weight.spec.ts takes the same measurement live), so
 * this pins the arithmetic to what the shell does, not to itself.
 */

const open = (viewportWidth: number, viewportHeight: number, safeTop = 0, safeBottom = 0) =>
	stageFrameBox({ viewportWidth, viewportHeight, safeTop, safeBottom });

function expectBox(box: FrameBox, left: number, top: number, width: number, height: number) {
	expect(box.left).toBeCloseTo(left, 1);
	expect(box.top).toBeCloseTo(top, 1);
	expect(box.width).toBeCloseTo(width, 1);
	expect(box.height).toBeCloseTo(height, 1);
}

describe("the desktop shell's frame", () => {
	it("is 576x324 at 1280x800, where the skeleton used to say 692x390", () => {
		expectBox(open(1280, 800), 352, 130, 576, 324);
	});

	it("fills the height the tall shell leaves at 1440x900", () => {
		expectBox(open(1440, 900), 343.11, 130, 753.77, 424);
	});

	it("takes the squeezed bands at 1366x650, the shortest window that fits", () => {
		expectBox(open(1366, 650), 430.56, 96, 504.88, 284);
	});

	it("takes the tall shell's bands just above the short-window rule, at 1366x768", () => {
		expectBox(open(1366, 768), 423.44, 130, 519.11, 292);
	});

	it("holds the stage's floor in a window too short to fit it, as the shell scrolls", () => {
		const box = open(1440, 500);
		expectBox(box, 470.22, 96, 499.55, 281);
		expect(box.height).toBeCloseTo(STAGE_FLOOR_HEIGHT, 0);
	});

	it("is the video's own 16:9", () => {
		for (const [width, height] of [
			[1280, 800],
			[1440, 500],
			[1366, 650],
			[390, 844],
		] as const) {
			const box = open(width, height);
			expect(box.width / box.height).toBeCloseTo(16 / 9, 3);
		}
	});

	it("is centred across the window", () => {
		for (const [width, height] of [
			[1280, 800],
			[1440, 900],
			[1920, 1080],
		] as const) {
			const box = open(width, height);
			expect(box.left + box.width / 2).toBeCloseTo(width / 2, 3);
		}
	});

	it("is the width's limit, not the height's, when the window is wide and the room short", () => {
		const box = open(1280, 1400);
		// 1280 - 2 * (44 + 32): the room's own width.
		expect(box.width).toBeCloseTo(1128, 1);
	});

	it("is the picture height the shell computes", () => {
		for (const height of [650, 700, 760, 800, 900, 1080]) {
			expect(open(1920, height).height).toBeCloseTo(pictureHeightAt(height), 3);
		}
	});

	it("never begins before the desktop shell does", () => {
		expect(open(DESKTOP_SCENE_MIN_WIDTH, 800).width).toBeCloseTo(576, 1);
		// One pixel narrower is the phone shell: the corner row's 68px, not the header's 130.
		expect(open(DESKTOP_SCENE_MIN_WIDTH - 1, 800).top).not.toBeCloseTo(130, 0);
	});
});

describe("the phone shell's frame", () => {
	// D4 of the 2026-10-08 design audit: the stage's width, hung under the corner
	// row. It was 310x174 centred at 390x844, inside the desktop's 32px inset.
	it("is 374x210.4 under the corner row at 390x844", () => {
		expectBox(open(390, 844), 8, 68, 374, 210.38);
	});

	it("is 804x452 at 820x1180, a tablet in portrait, from the top too", () => {
		expectBox(open(820, 1180), 8, 68, 804, 452.25);
	});

	it("is 344x193.5 at 360x640", () => {
		expectBox(open(360, 640), 8, 68, 344, 193.5);
	});

	it("is the phone sheet's own frame, so the outline and the studio agree", () => {
		const sheet = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 47,
			safeBottom: 34,
		});
		const box = open(390, 844, 47, 34);
		expectBox(box, sheet.frame.left, sheet.frame.top, sheet.frame.width, sheet.frame.height);
		expect(box.top).toBe(sheet.rowBottom + STAGE_TOP_GAP);
	});

	it("moves down with the notch", () => {
		expect(open(390, 844, 47, 34).top).not.toBeCloseTo(open(390, 844).top, 0);
	});

	it("keeps clear of a landscape notch's sides, as the stage does", () => {
		const box = stageFrameBox({
			viewportWidth: 844,
			viewportHeight: 390,
			safeTop: 0,
			safeBottom: 21,
			safeLeft: 47,
			safeRight: 47,
		});
		expect(box.left).toBeGreaterThanOrEqual(47);
		expect(box.left + box.width).toBeLessThanOrEqual(844 - 47);
	});
});
