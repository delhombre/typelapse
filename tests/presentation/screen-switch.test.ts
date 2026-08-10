import { screenPlacement } from "@/presentation/landing/screen-switch";
import { describe, expect, it } from "vitest";

const OPTIONS = { count: 5, gap: 6, offscreenScale: 0.94 };

function placement(index: number, activeIndex: number, count = OPTIONS.count) {
	return screenPlacement({ ...OPTIONS, count, index, activeIndex });
}

describe("screenPlacement", () => {
	it("puts the active screen at rest, full size, and animates it", () => {
		expect(placement(2, 2)).toEqual({ x: "0%", scale: 1, animated: true });
	});

	it("sends the screen that was just active out to the left, animated", () => {
		expect(placement(1, 2)).toEqual({ x: "-106%", scale: 0.94, animated: true });
	});

	it("parks every other screen off to the right, without animating the move", () => {
		expect(placement(3, 2)).toEqual({ x: "106%", scale: 0.94, animated: false });
		expect(placement(4, 2)).toEqual({ x: "106%", scale: 0.94, animated: false });
	});

	it("repositions the previously-exited screen to the right instantly, never across the screen", () => {
		// index 0 exited on the previous switch (it sat at -106%). Now that the cycle
		// moved on it belongs to the waiting side again, and must jump there offscreen.
		expect(placement(0, 2)).toEqual({ x: "106%", scale: 0.94, animated: false });
	});

	it("wraps: when the cycle returns to the first screen, the last one is the exiting one", () => {
		expect(placement(0, 0)).toEqual({ x: "0%", scale: 1, animated: true });
		expect(placement(4, 0)).toEqual({ x: "-106%", scale: 0.94, animated: true });
		expect(placement(1, 0)).toEqual({ x: "106%", scale: 0.94, animated: false });
	});

	it("keeps the entering screen coming from the right across the wrap", () => {
		// Before the wrap the active screen is the last one, so the first screen waits
		// on the right; after the wrap it is active. It therefore travels right → rest.
		expect(placement(0, 4).x).toBe("106%");
		expect(placement(0, 0).x).toBe("0%");
	});

	it("scales the offsets with the gap", () => {
		expect(screenPlacement({ ...OPTIONS, gap: 0, index: 1, activeIndex: 2 }).x).toBe("-100%");
		expect(screenPlacement({ ...OPTIONS, gap: 12, index: 3, activeIndex: 2 }).x).toBe("112%");
	});

	it("normalises an out-of-range active index", () => {
		expect(placement(0, 5)).toEqual(placement(0, 0));
		expect(placement(3, -1)).toEqual(placement(3, 4));
	});

	it("treats a lone screen as permanently active", () => {
		expect(placement(0, 0, 1)).toEqual({ x: "0%", scale: 1, animated: true });
	});

	it("has no waiting side with two screens, so the idle one waits on the right", () => {
		expect(placement(0, 0, 2)).toEqual({ x: "0%", scale: 1, animated: true });
		expect(placement(1, 0, 2)).toEqual({ x: "106%", scale: 0.94, animated: true });
	});
});
