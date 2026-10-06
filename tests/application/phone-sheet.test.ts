import { phoneSheetGeometry } from "@/application/layout/phone-sheet";
import { describe, expect, it } from "vitest";

describe("the phone sheet's stops", () => {
	it("gives a portrait phone without a notch a peek, a scenes stop and a full stop", () => {
		const sheet = phoneSheetGeometry({ viewportHeight: 844, safeTop: 0, safeBottom: 0 });
		expect(sheet.stops).toEqual({ peek: 56, scenes: 464, full: 786 });
	});

	it("keeps the corner row and the full sheet clear of a notch", () => {
		const sheet = phoneSheetGeometry({ viewportHeight: 844, safeTop: 47, safeBottom: 34 });
		expect(sheet.rowBottom).toBe(87);
		// The full sheet stops under the row, never under its chips.
		expect(sheet.stops.full).toBe(844 - 87 - 8);
	});

	it("lifts the peek above the home indicator, so the handle is not the home gesture", () => {
		const sheet = phoneSheetGeometry({ viewportHeight: 844, safeTop: 47, safeBottom: 34 });
		expect(sheet.stops.peek).toBe(56 + 34);
	});

	it("drops the scenes stop when the frame would have no room above it", () => {
		// A phone on its side: 390 tall. A scenes stop there squeezed the frame to
		// nothing and drew it cropped behind the instrument.
		const sheet = phoneSheetGeometry({ viewportHeight: 390, safeTop: 0, safeBottom: 21 });
		expect(sheet.stops.scenes).toBeNull();
		expect(sheet.stops.full).toBe(390 - 50 - 8);
	});

	it("keeps the scenes stop on a small portrait phone, below the frame's minimum room", () => {
		const sheet = phoneSheetGeometry({ viewportHeight: 667, safeTop: 20, safeBottom: 0 });
		expect(sheet.stops.scenes).not.toBeNull();
		const scenes = sheet.stops.scenes ?? 0;
		// Row, gap, frame, the instrument's room: what is left is the sheet's.
		expect(667 - scenes).toBeGreaterThanOrEqual(sheet.rowBottom + 18 + 120 + 116 + 12);
	});

	it("floats the instrument on the sheet's edge, and at the bottom over the full sheet", () => {
		const sheet = phoneSheetGeometry({ viewportHeight: 844, safeTop: 47, safeBottom: 34 });
		expect(sheet.dockLift("peek")).toBe(90 + 12);
		expect(sheet.dockLift("scenes")).toBe(464 + 12);
		expect(sheet.dockLift("full")).toBe(34);
		expect(
			phoneSheetGeometry({ viewportHeight: 844, safeTop: 0, safeBottom: 0 }).dockLift("full"),
		).toBe(12);
	});

	it("keeps the frame's room over the full sheet rather than refitting it to a frame nobody sees", () => {
		const portrait = phoneSheetGeometry({ viewportHeight: 844, safeTop: 0, safeBottom: 0 });
		expect(portrait.stageLift("full")).toBe(portrait.stageLift("scenes"));
		const landscape = phoneSheetGeometry({ viewportHeight: 390, safeTop: 0, safeBottom: 21 });
		expect(landscape.stageLift("full")).toBe(landscape.stageLift("peek"));
	});

	it("reads a stop that is not there as the peek", () => {
		const landscape = phoneSheetGeometry({ viewportHeight: 390, safeTop: 0, safeBottom: 21 });
		expect(landscape.resolve("scenes")).toBe("peek");
		expect(landscape.resolve("full")).toBe("full");
	});
});

describe("the instrument while the sheet is dragged", () => {
	const notch = phoneSheetGeometry({ viewportHeight: 812, safeTop: 47, safeBottom: 34 });
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
		const plain = phoneSheetGeometry({ viewportHeight: 844, safeTop: 0, safeBottom: 0 });
		expect(plain.dockLiftAt(0)).toBe(12);
	});

	it("on a phone on its side, rides the peek and comes down to the full stop", () => {
		const landscape = phoneSheetGeometry({ viewportHeight: 390, safeTop: 0, safeBottom: 21 });
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
	const portrait = phoneSheetGeometry({ viewportHeight: 812, safeTop: 47, safeBottom: 34 });
	const landscape = phoneSheetGeometry({ viewportHeight: 390, safeTop: 0, safeBottom: 21 });

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
