import { phoneSheetGeometry } from "@/application/layout/phone-sheet";
import { describe, expect, it } from "vitest";

describe("the phone sheet's stops", () => {
	it("gives a portrait phone without a notch a peek, a scenes stop and a full stop", () => {
		const sheet = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 0,
			safeBottom: 0,
		});
		// The scenes stop is what the 374x210 frame and the instrument under it leave:
		// 844 - (68 + 210.4) - 72 - 12, floored (design audit 2026-10-08 D4).
		expect(sheet.stops).toEqual({ peek: 56, scenes: 481, full: 786 });
	});

	it("keeps the corner row and the full sheet clear of a notch", () => {
		const sheet = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 47,
			safeBottom: 34,
		});
		expect(sheet.rowBottom).toBe(87);
		// The full sheet stops under the row, never under its chips.
		expect(sheet.stops.full).toBe(844 - 87 - 8);
	});

	it("lifts the peek above the home indicator, so the handle is not the home gesture", () => {
		const sheet = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 47,
			safeBottom: 34,
		});
		expect(sheet.stops.peek).toBe(56 + 34);
	});

	it("drops the scenes stop when the frame would have no room above it", () => {
		// A phone on its side: 390 tall. A scenes stop there squeezed the frame to
		// nothing and drew it cropped behind the instrument.
		const sheet = phoneSheetGeometry({
			viewportWidth: 844,
			viewportHeight: 390,
			safeTop: 0,
			safeBottom: 21,
		});
		expect(sheet.stops.scenes).toBeNull();
		expect(sheet.stops.full).toBe(390 - 50 - 8);
	});

	it("keeps the scenes stop on a small portrait phone, below the frame's minimum room", () => {
		const sheet = phoneSheetGeometry({
			viewportWidth: 375,
			viewportHeight: 667,
			safeTop: 20,
			safeBottom: 0,
		});
		expect(sheet.stops.scenes).not.toBeNull();
		const scenes = sheet.stops.scenes ?? 0;
		// The frame at the stage's width, the instrument's room: what is left is the sheet's.
		expect(667 - scenes).toBeGreaterThanOrEqual(sheet.frame.top + sheet.frame.height + 72 + 12);
	});

	it("floats the instrument on the sheet's edge, and at the bottom over the full sheet", () => {
		const sheet = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 47,
			safeBottom: 34,
		});
		expect(sheet.dockLift("peek")).toBe(90 + 12);
		// Under the notch the frame ends at 105 + 210.4: the scenes stop is 444.
		expect(sheet.dockLift("scenes")).toBe(444 + 12);
		expect(sheet.dockLift("full")).toBe(34);
		expect(
			phoneSheetGeometry({
				viewportWidth: 390,
				viewportHeight: 844,
				safeTop: 0,
				safeBottom: 0,
			}).dockLift("full"),
		).toBe(12);
	});

	it("reads a stop that is not there as the peek", () => {
		const landscape = phoneSheetGeometry({
			viewportWidth: 844,
			viewportHeight: 390,
			safeTop: 0,
			safeBottom: 21,
		});
		expect(landscape.resolve("scenes")).toBe("peek");
		expect(landscape.resolve("full")).toBe("full");
	});
});

describe("on a phone the geometry starts from the frame (design audit D4)", () => {
	const plain = phoneSheetGeometry({
		viewportWidth: 390,
		viewportHeight: 844,
		safeTop: 0,
		safeBottom: 0,
	});

	it("takes the stage's full width and anchors under the corner row", () => {
		// The audit measured a 213x120 frame at the scenes stop and 310x174 at the peek.
		expect(plain.frame.left).toBe(8);
		expect(plain.frame.top).toBe(68);
		expect(plain.frame.width).toBe(374);
		expect(plain.frame.height).toBeCloseTo(210.375, 3);
	});

	it("moves down with a notch and keeps clear of a landscape notch's sides", () => {
		const notch = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 47,
			safeBottom: 34,
		});
		expect(notch.frame.top).toBe(87 + 18);
		const side = phoneSheetGeometry({
			viewportWidth: 844,
			viewportHeight: 390,
			safeTop: 0,
			safeBottom: 21,
			safeLeft: 47,
			safeRight: 47,
		});
		expect(side.frame.left).toBeGreaterThanOrEqual(47);
		expect(side.frame.left + side.frame.width).toBeLessThanOrEqual(844 - 47);
	});

	it("leaves the 60px instrument between the frame and the sheet at the scenes stop", () => {
		const instrumentTop = 844 - plain.dockLift("scenes") - 60;
		expect(instrumentTop).toBeGreaterThanOrEqual(plain.frame.top + plain.frame.height);
	});

	it("keeps one stage at every stop, so the frame never refits under a moving sheet", () => {
		// What lies under the stage is a figure of the window, not of the stop.
		expect(plain.stageBottom).toBeCloseTo(844 - 68 - 210.375, 3);
	});

	it("gives a 9:16 frame the height, and no scenes stop below it", () => {
		const tall = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 0,
			safeBottom: 0,
			aspect: 9 / 16,
		});
		expect(tall.stops.scenes).toBeNull();
		expect(tall.order).toEqual(["peek", "full"]);
		expect(tall.frame.height).toBeGreaterThan(300);
		// Fit to the height above the peek's instrument, centred across the stage.
		expect(tall.frame.top + tall.frame.height).toBeCloseTo(844 - (56 + 12) - 72, 3);
		expect(tall.frame.left + tall.frame.width / 2).toBeCloseTo(195, 3);
	});

	it("keeps a scenes stop under a square frame", () => {
		const square = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 0,
			safeBottom: 0,
			aspect: 1,
		});
		expect(square.frame.height).toBe(374);
		expect(square.stops.scenes).toBe(844 - (68 + 374) - 72 - 12);
	});

	it("fits a phone on its side to the height above the instrument", () => {
		const landscape = phoneSheetGeometry({
			viewportWidth: 844,
			viewportHeight: 390,
			safeTop: 0,
			safeBottom: 21,
		});
		expect(landscape.frame.top + landscape.frame.height).toBeCloseTo(390 - (56 + 21 + 12) - 72, 3);
		expect(landscape.frame.width / landscape.frame.height).toBeCloseTo(16 / 9, 3);
	});
});

describe("the instrument while the sheet is dragged", () => {
	const notch = phoneSheetGeometry({
		viewportWidth: 390,
		viewportHeight: 812,
		safeTop: 47,
		safeBottom: 34,
	});
	const { peek, scenes, full } = notch.stops;
	const scenesAt = scenes ?? 0;

	it("sits where the stops put it when the sheet rests on one", () => {
		expect(notch.dockLiftAt(peek)).toBe(notch.dockLift("peek"));
		expect(notch.dockLiftAt(scenesAt)).toBe(notch.dockLift("scenes"));
		expect(notch.dockLiftAt(full)).toBe(notch.dockLift("full"));
	});

	it("rides the sheet's edge, 12px above it, from the peek to the scenes stop", () => {
		for (const visible of [peek, peek + 40, (peek + scenesAt) / 2, scenesAt]) {
			expect(notch.dockLiftAt(visible)).toBe(visible + 12);
		}
	});

	it("comes down to the bottom as the sheet goes on to the full stop, one way and without a jump", () => {
		let previous = notch.dockLiftAt(scenesAt);
		for (let visible = scenesAt; visible <= full; visible += 10) {
			const lift = notch.dockLiftAt(visible);
			expect(lift).toBeLessThanOrEqual(previous);
			// It has further to go than the sheet has, so it moves faster, but evenly.
			expect(previous - lift).toBeLessThan(20);
			previous = lift;
		}
		expect(notch.dockLiftAt(full)).toBe(34);
	});

	it("never goes below the home indicator, however far the sheet is pulled down", () => {
		expect(notch.dockLiftAt(0)).toBe(34);
		expect(notch.dockLiftAt(-200)).toBe(34);
		const plain = phoneSheetGeometry({
			viewportWidth: 390,
			viewportHeight: 844,
			safeTop: 0,
			safeBottom: 0,
		});
		expect(plain.dockLiftAt(0)).toBe(12);
	});

	it("on a phone on its side, rides the peek and comes down to the full stop", () => {
		const landscape = phoneSheetGeometry({
			viewportWidth: 844,
			viewportHeight: 390,
			safeTop: 0,
			safeBottom: 21,
		});
		const { peek: low, full: high } = landscape.stops;
		expect(landscape.dockLiftAt(low)).toBe(low + 12);
		expect(landscape.dockLiftAt(high)).toBe(landscape.dockLift("full"));
		const half = landscape.dockLiftAt((low + high) / 2);
		expect(half).toBeLessThan(low + 12);
		expect(half).toBeGreaterThan(21);
	});

	it("does not ask for more than the full stop", () => {
		expect(notch.dockLiftAt(full + 50)).toBe(34);
	});
});

describe("moving between the stops without a finger", () => {
	const portrait = phoneSheetGeometry({
		viewportWidth: 390,
		viewportHeight: 812,
		safeTop: 47,
		safeBottom: 34,
	});
	const landscape = phoneSheetGeometry({
		viewportWidth: 844,
		viewportHeight: 390,
		safeTop: 0,
		safeBottom: 21,
	});

	it("lists the stops that exist, lowest first", () => {
		expect(portrait.order).toEqual(["peek", "scenes", "full"]);
		expect(landscape.order).toEqual(["peek", "full"]);
	});

	it("raises and lowers one stop at a time and stops at the ends", () => {
		expect(portrait.step("peek", "raise")).toBe("scenes");
		expect(portrait.step("scenes", "raise")).toBe("full");
		expect(portrait.step("full", "raise")).toBe("full");
		expect(portrait.step("full", "lower")).toBe("scenes");
		expect(portrait.step("peek", "lower")).toBe("peek");
		expect(landscape.step("peek", "raise")).toBe("full");
	});

	it("cycles upward and comes back to the peek from the top", () => {
		expect(portrait.step("peek", "cycle")).toBe("scenes");
		expect(portrait.step("scenes", "cycle")).toBe("full");
		expect(portrait.step("full", "cycle")).toBe("peek");
		expect(landscape.step("full", "cycle")).toBe("peek");
	});

	it("jumps to the ends", () => {
		expect(portrait.step("scenes", "first")).toBe("peek");
		expect(portrait.step("scenes", "last")).toBe("full");
	});

	it("moves on from a stop that is not there as from the peek", () => {
		expect(landscape.step("scenes", "raise")).toBe("full");
	});
});
