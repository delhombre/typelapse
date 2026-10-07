import { easeInOutCubic } from "@/application/magic-move/engine";
import {
	NO_ZOOM,
	ZOOM_SCALE,
	interpolateZoom,
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

describe("zoomOriginX", () => {
	// Ticket #227: centred on a window that cuts a long line, the push-in carried
	// the gutter and the line's first columns off the left edge, mid-glyph.
	const cut = { visibleColumns: 185, fadeStart: 182, fadeEnd: 185.5 };

	it("pivots on the body's left edge when the code column cuts a line", () => {
		expect(zoomOriginX(cut)).toBe(0);
	});

	it("stays centred on a window whose lines fit, as before", () => {
		expect(zoomOriginX(null)).toBe(0.5);
	});
});
