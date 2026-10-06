import { PANEL_GAP, PANEL_MIN_HEIGHT, phonePanelRoom } from "@/application/layout/phone-panel";
import { DOCK_ROOM, STAGE_TOP_GAP, phoneSheetGeometry } from "@/application/layout/phone-sheet";
import { describe, expect, it } from "vitest";

const plain = { viewportHeight: 844, safeTop: 0, safeBottom: 0 };
const notch = { viewportHeight: 844, safeTop: 47, safeBottom: 34 };
/** What the dock stacks besides the panel: the margin under it, the plate, its padding (10 + 48 + 12). */
const REST = 70;

/** Where the frame ends: centred in the stage's slot, which stops at the instrument's room. */
function frameBottom(input: typeof plain, stop: "peek" | "scenes" | "full", frame: number) {
	const sheet = phoneSheetGeometry(input);
	const top = sheet.rowBottom + STAGE_TOP_GAP;
	const bottom = input.viewportHeight - (sheet.stageLift(stop) + DOCK_ROOM);
	return (top + bottom) / 2 + frame / 2;
}

/** Where the panel's top lands when it is as tall as it may be. */
function panelTop(input: typeof plain, stop: "peek" | "scenes" | "full", frame: number | null) {
	const sheet = phoneSheetGeometry(input);
	const room = phonePanelRoom(input, stop, frame, REST);
	return input.viewportHeight - sheet.dockLift(stop) - REST - room;
}

describe("the room an island panel has under the frame", () => {
	it("puts the panel's top a gap below the frame's bottom, whatever the frame's height", () => {
		for (const frame of [94, 174]) {
			const top = panelTop(plain, "peek", frame);
			expect(top).toBeGreaterThanOrEqual(frameBottom(plain, "peek", frame) + PANEL_GAP - 1);
			expect(top).toBeLessThanOrEqual(frameBottom(plain, "peek", frame) + PANEL_GAP + 1);
		}
	});

	it("gives a taller frame less room, and takes from the panel what the dock stacks besides it", () => {
		expect(phonePanelRoom(plain, "peek", 250, REST)).toBeLessThan(
			phonePanelRoom(plain, "peek", 174, REST),
		);
		expect(phonePanelRoom(plain, "peek", 174, REST + 56)).toBe(
			phonePanelRoom(plain, "peek", 174, REST) - 56,
		);
	});

	it("follows the home indicator and the notch, which move the stage and the sheet", () => {
		expect(phonePanelRoom(notch, "peek", 174, REST)).not.toBe(
			phonePanelRoom(plain, "peek", 174, REST),
		);
		expect(panelTop(notch, "peek", 174)).toBeGreaterThanOrEqual(
			frameBottom(notch, "peek", 174) + PANEL_GAP - 1,
		);
	});

	it("follows the sheet when a hand has moved it up from the peek", () => {
		expect(phonePanelRoom(plain, "scenes", 94, REST)).not.toBe(
			phonePanelRoom(plain, "peek", 94, REST),
		);
	});

	it("lets a panel over an empty stage rise to the corner row", () => {
		expect(phonePanelRoom(plain, "peek", null, REST)).toBeGreaterThan(
			phonePanelRoom(plain, "peek", 94, REST),
		);
	});

	it("never takes a panel below its minimum, even where the frame fills the stage", () => {
		expect(phonePanelRoom(plain, "peek", 592, REST)).toBe(PANEL_MIN_HEIGHT);
		expect(
			phonePanelRoom({ viewportHeight: 390, safeTop: 0, safeBottom: 21 }, "peek", 117, REST),
		).toBe(PANEL_MIN_HEIGHT);
	});

	it("is a whole number of pixels, so the panel's edge is not blurred", () => {
		expect(Number.isInteger(phonePanelRoom(plain, "peek", 93.7, REST))).toBe(true);
	});
});
