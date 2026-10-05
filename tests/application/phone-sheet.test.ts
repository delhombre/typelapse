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
