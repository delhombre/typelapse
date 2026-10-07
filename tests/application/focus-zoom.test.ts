import { easeInOutCubic } from "@/application/magic-move/engine";
import {
	NO_ZOOM,
	ZOOM_SCALE,
	interpolateZoom,
	pushInFade,
	zoomForFocus,
	zoomOriginX,
} from "@/application/magic-move/focus-zoom";
import { describe, expect, it } from "vitest";

describe("zoomForFocus", () => {
	it("is the identity transform with no focus or an empty set", () => {
		expect(zoomForFocus(undefined, 10)).toEqual(NO_ZOOM);
		expect(zoomForFocus(new Set(), 10)).toEqual(NO_ZOOM);
	});

	it("centers on a single focused line's vertical midpoint", () => {
		// Line 3 (1-indexed) spans grid rows [2,3); its center row is 2.5, so the
		// ratio over 10 lines is 0.25.
		const zoom = zoomForFocus(new Set([3]), 10);
		expect(zoom.scale).toBe(ZOOM_SCALE);
		expect(zoom.originYRatio).toBeCloseTo(0.25, 6);
	});

	it("centers on the middle of a multi-line focused band", () => {
		// Lines 2..4 span rows [1,4); center row 2.5 → 0.25 over 10 lines.
		const zoom = zoomForFocus(new Set([2, 3, 4]), 10);
		expect(zoom.scale).toBe(ZOOM_SCALE);
		expect(zoom.originYRatio).toBeCloseTo(0.25, 6);
	});

	it("ignores gaps and uses only the min/max of the band", () => {
		// {2,4} → min 2, max 4 → same band center as {2,3,4}.
		expect(zoomForFocus(new Set([2, 4]), 10).originYRatio).toBeCloseTo(0.25, 6);
	});

	it("finds the band of a set far too large to spread into arguments", () => {
		const focus = new Set<number>();
		for (let line = 1; line <= 300_000; line++) {
			focus.add(line);
		}
		expect(() => zoomForFocus(focus, 300_000)).not.toThrow();
		expect(zoomForFocus(focus, 300_000).originYRatio).toBeCloseTo(0.5, 6);
	});

	it("clamps the origin ratio into 0..1 when focus sits past the line count", () => {
		// Line 10 over only 5 lines → raw 1.9, clamped to 1.
		expect(zoomForFocus(new Set([10]), 5).originYRatio).toBe(1);
	});

	it("treats a zero line count as a single line without dividing by zero", () => {
		const zoom = zoomForFocus(new Set([1]), 0);
		expect(Number.isFinite(zoom.originYRatio)).toBe(true);
		expect(zoom.originYRatio).toBe(0.5);
	});
});

describe("interpolateZoom", () => {
	it("returns the eased midpoint of scale and origin", () => {
		// easeInOutCubic(0.5) === 0.5, so this is the linear midpoint.
		const mid = interpolateZoom(
			NO_ZOOM,
			{ scale: ZOOM_SCALE, originYRatio: 0.25 },
			0.5,
			easeInOutCubic,
		);
		expect(mid.scale).toBeCloseTo(1.125, 6);
		expect(mid.originYRatio).toBeCloseTo(0.375, 6);
	});

	it("returns the endpoints at t=0 and t=1", () => {
		const to = { scale: ZOOM_SCALE, originYRatio: 0.2 };
		expect(interpolateZoom(NO_ZOOM, to, 0, easeInOutCubic)).toEqual(NO_ZOOM);
		expect(interpolateZoom(NO_ZOOM, to, 1, easeInOutCubic)).toEqual(to);
	});
});

describe("the push-in's pivot and its right fade", () => {
	// Editor px at the defaults: padding 24, a two-digit gutter of 30.8, cells of 8.4.
	const PADDING = 24;
	const windowFor = (columns: number) => 2 * PADDING + 30.8 + (columns + 2) * 8.4;
	/** Where the gutter's left edge lands under the full push-in, from the window's left edge. */
	const gutterEdge = (origin: number, width: number) =>
		ZOOM_SCALE * PADDING - origin * (ZOOM_SCALE - 1) * width;

	it.each([
		["greet, 37 columns", windowFor(37), 0.2953],
		["an 80-column window", windowFor(80), 0.1563],
		["the long line, cut at the floor's 185 columns", 1637, 0.0733],
	])("pivots %s just far enough left to keep the gutter", (_name, width, expected) => {
		const origin = zoomOriginX({ padding: PADDING, bodyWidth: width });
		expect(origin).toBeCloseTo(expected, 4);
		// The gutter's left edge lands on the window's edge, not past it.
		expect(gutterEdge(origin, width)).toBeCloseTo(0, 9);
	});

	it("stays centred on a window narrow enough that the centred crop spares the gutter", () => {
		const width = 200;
		expect(zoomOriginX({ padding: PADDING, bodyWidth: width })).toBe(0.5);
		expect(gutterEdge(0.5, width)).toBeGreaterThan(0);
	});

	it("is the same ratio in any unit", () => {
		const editor = zoomOriginX({ padding: PADDING, bodyWidth: windowFor(80) });
		expect(zoomOriginX({ padding: PADDING * 2.2, bodyWidth: windowFor(80) * 2.2 })).toBeCloseTo(
			editor,
			12,
		);
	});

	it("fades the window's right edge in with the push-in, as deep as the window's own right fade", () => {
		const geometry = { windowWidth: 800, fontSize: 30.8, windowCutsRight: false };
		expect(pushInFade({ ...geometry, zoomScale: 1 })).toBeNull();
		expect(pushInFade({ ...geometry, zoomScale: ZOOM_SCALE })).toEqual({
			width: 4 * 30.8,
			opacity: 1,
		});
		expect(pushInFade({ ...geometry, zoomScale: 1.125 })?.opacity).toBeCloseTo(0.5, 9);
		// Never wider than the window.
		expect(pushInFade({ ...geometry, windowWidth: 60, zoomScale: ZOOM_SCALE })?.width).toBe(60);
	});

	it("adds nothing to a window that already fades its right edge (a cut long line)", () => {
		expect(
			pushInFade({
				windowWidth: 800,
				fontSize: 30.8,
				windowCutsRight: true,
				zoomScale: ZOOM_SCALE,
			}),
		).toBeNull();
	});
});
