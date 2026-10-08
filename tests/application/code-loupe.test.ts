import {
	LOUPE_CLOSE_PULL,
	LOUPE_FIT_BOOST,
	LOUPE_FLOOR_PX,
	LOUPE_KEY_STEP,
	LOUPE_MARGIN,
	loupeBounds,
	loupeScale,
	loupeViewport,
	nudgeLoupe,
	openLoupe,
	pulledToClose,
	releaseLoupe,
	rubberBand,
} from "@/application/layout/code-loupe";
import { describe, expect, it } from "vitest";

/** A 390x844 phone with a notch, as the studio sees it. */
const SCREEN = { width: 390, height: 844, safeTop: 47, safeBottom: 34 };
/** Inside the 16:9 frame at the stage's width (8, 105, 374x210 under the corner row, D4): the default snippet's window: 820 of 1920 px wide, about the middle of the frame. */
const WINDOW = { x: 115.1, y: 167.4, width: 159.8, height: 85.6 };
/** A 170-column file: the window nearly fills the frame. */
const WIDE_WINDOW = { x: 56.6, y: 121.3, width: 276.8, height: 177.8 };

/** Where a rest point lands on the screen under a view. */
const at = (view: { scale: number; x: number; y: number }, point: { x: number; y: number }) => ({
	x: view.x + view.scale * point.x,
	y: view.y + view.scale * point.y,
});

describe("the loupe's magnification", () => {
	it("brings the code to the 11px floor", () => {
		// 6px code on the phone's frame needs 11/6 of it.
		expect(loupeScale(6) * 6).toBeCloseTo(LOUPE_FLOOR_PX, 6);
		expect(loupeScale(2.53) * 2.53).toBeCloseTo(11, 6);
	});

	it("never magnifies less than 1.25 times the fit, so a tap always reads as a zoom", () => {
		// 10px code is nearly at the floor already: the loupe still grows it a quarter.
		expect(loupeScale(10)).toBe(LOUPE_FIT_BOOST);
		expect(loupeScale(40)).toBe(LOUPE_FIT_BOOST);
	});

	it("takes another floor when asked", () => {
		expect(loupeScale(4, 14) * 4).toBeCloseTo(14, 6);
	});
});

describe("the loupe's view", () => {
	it("runs from under the Done chip's row to above the home indicator", () => {
		expect(loupeViewport(SCREEN)).toEqual({
			x: 0,
			y: 47 + 58,
			width: 390,
			height: 844 - 105 - 24 - 34,
		});
		expect(loupeViewport({ ...SCREEN, safeTop: 0, safeBottom: 0 }).y).toBe(58);
	});
});

describe("opening the loupe", () => {
	const view = loupeViewport(SCREEN);

	it("puts the window's left edge 12px from the screen's, where column 1 is read from", () => {
		const scale = loupeScale(2.53);
		const open = openLoupe({ scale, viewport: view, window: WIDE_WINDOW, tap: { x: 200, y: 200 } });
		expect(at(open, WIDE_WINDOW).x).toBeCloseTo(LOUPE_MARGIN, 6);
	});

	it("keeps the tapped line under the finger when the window is taller than the screen", () => {
		const scale = loupeScale(2.53);
		const tap = { x: 120, y: 140 };
		const open = openLoupe({ scale, viewport: view, window: WIDE_WINDOW, tap });
		expect(at(open, tap).y).toBeCloseTo(tap.y, 6);
	});

	it("clamps the tapped line so the window's edge never leaves its margin", () => {
		// Held under the finger, a tap on the window's first row would leave its top
		// lower than the margin under the view's top: it stays on the margin instead.
		const scale = loupeScale(2.53);
		const open = openLoupe({ scale, viewport: view, window: WIDE_WINDOW, tap: { x: 100, y: 122 } });
		expect(at(open, WIDE_WINDOW).y).toBeCloseTo(view.y + LOUPE_MARGIN, 6);
	});

	it("centres a window shorter than the view, whichever line was tapped", () => {
		const scale = loupeScale(5.6);
		const open = openLoupe({ scale, viewport: view, window: WINDOW, tap: { x: 150, y: 170 } });
		const top = at(open, WINDOW).y;
		const bottom = at(open, { x: 0, y: WINDOW.y + WINDOW.height }).y;
		expect(top - view.y).toBeCloseTo(view.y + view.height - bottom, 6);
	});

	it("opens on the window's top-left corner from the keyboard, which has no point", () => {
		const scale = loupeScale(2.53);
		const open = openLoupe({ scale, viewport: view, window: WIDE_WINDOW });
		expect(at(open, WIDE_WINDOW)).toEqual({
			x: expect.closeTo(LOUPE_MARGIN, 6),
			y: expect.closeTo(view.y + LOUPE_MARGIN, 6),
		});
	});

	it("reopens from wherever a closing loupe had got to, about the point under the finger", () => {
		// A tap while the loupe is still shrinking catches it: the line under the finger
		// is found through the view it was drawn with, and stays there.
		const scale = loupeScale(2.53);
		const from = { scale: 2, x: -150, y: -180 };
		const tap = { x: 100, y: 100 };
		const open = openLoupe({ scale, viewport: view, window: WIDE_WINDOW, tap, from });
		const rest = { x: (tap.x - from.x) / from.scale, y: (tap.y - from.y) / from.scale };
		expect(at(open, rest).y).toBeCloseTo(tap.y, 6);
	});

	it("centres a window narrower than the screen", () => {
		// A 1.25x loupe on a narrow window leaves room on both sides.
		const open = openLoupe({ scale: 1.25, viewport: view, window: WINDOW });
		const left = at(open, WINDOW).x;
		const right = at(open, { x: WINDOW.x + WINDOW.width, y: 0 }).x;
		expect(left).toBeCloseTo(390 - right, 6);
	});
});

describe("the pan's bounds", () => {
	const view = loupeViewport(SCREEN);
	const scale = loupeScale(2.53);
	const bounds = loupeBounds(scale, view, WIDE_WINDOW);

	it("stop with the window's right edge 12px from the screen's", () => {
		const right = { x: WIDE_WINDOW.x + WIDE_WINDOW.width, y: 0 };
		expect(at({ scale, x: bounds.minX, y: 0 }, right).x).toBeCloseTo(390 - LOUPE_MARGIN, 6);
		expect(at({ scale, x: bounds.maxX, y: 0 }, WIDE_WINDOW).x).toBeCloseTo(LOUPE_MARGIN, 6);
	});

	it("stop with the window's foot 12px above the view's", () => {
		const foot = { x: 0, y: WIDE_WINDOW.y + WIDE_WINDOW.height };
		expect(at({ scale, x: 0, y: bounds.minY }, foot).y).toBeCloseTo(
			view.y + view.height - LOUPE_MARGIN,
			6,
		);
	});
});

describe("the rubber band at the edges", () => {
	it("leaves a value inside the bounds alone", () => {
		expect(rubberBand(40, 0, 100, 390)).toBe(40);
	});

	it("gives less and less the further a finger pulls past an edge", () => {
		const a = rubberBand(-40, 0, 100, 390);
		const b = rubberBand(-80, 0, 100, 390);
		expect(a).toBeLessThan(0);
		expect(a).toBeGreaterThan(-40);
		expect(b - a).toBeGreaterThan(-40);
		expect(rubberBand(180, 0, 100, 390)).toBeLessThan(180);
		expect(rubberBand(180, 0, 100, 390)).toBeGreaterThan(100);
	});

	it("never passes the dimension it is measured against", () => {
		expect(rubberBand(100_000, 0, 100, 390)).toBeLessThan(100 + 390);
	});
});

describe("letting go of a pan", () => {
	const bounds = { minX: -500, maxX: 0, minY: -300, maxY: 0 };

	it("carries a third of a second of the finger's speed, inside the bounds", () => {
		expect(releaseLoupe({ x: -100, y: -100 }, { x: -300, y: 0 }, bounds)).toEqual({
			x: -100 - 300 * 0.32,
			y: -100,
		});
		expect(releaseLoupe({ x: -100, y: -100 }, { x: -9000, y: 9000 }, bounds)).toEqual({
			x: -500,
			y: 0,
		});
	});

	it("closes when the window was pulled more than 72px past its top", () => {
		expect(pulledToClose(LOUPE_CLOSE_PULL + 1, bounds)).toBe(true);
		expect(pulledToClose(LOUPE_CLOSE_PULL, bounds)).toBe(false);
		expect(pulledToClose(-40, bounds)).toBe(false);
	});
});

describe("the arrow keys", () => {
	const bounds = { minX: -500, maxX: 0, minY: -300, maxY: 0 };

	it("move the code 48px the way the arrow points, and stop at the bounds", () => {
		const view = { scale: 2, x: -100, y: -100 };
		// ArrowRight reads further right: the code moves left.
		expect(nudgeLoupe(view, "ArrowRight", bounds)).toEqual({ ...view, x: -100 - LOUPE_KEY_STEP });
		expect(nudgeLoupe(view, "ArrowDown", bounds)).toEqual({ ...view, y: -100 - LOUPE_KEY_STEP });
		expect(nudgeLoupe(view, "ArrowLeft", bounds)).toEqual({ ...view, x: -52 });
		expect(nudgeLoupe({ ...view, y: -20 }, "ArrowUp", bounds)).toEqual({ ...view, y: 0 });
	});
});
