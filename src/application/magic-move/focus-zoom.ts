/**
 * Focus zoom: pure. Turns a step's spotlight (the set of focused line numbers)
 * into a cinematic push-in: a constant scale and a vertical origin centered on
 * the focused band. Shared by the browser preview and the Remotion video so the
 * export pushes in exactly like the preview (WYSIWYG).
 *
 * The transform is applied by the renderer as `scale(scale)` with
 * `transform-origin: 50% {originYRatio * 100%}`; this module only computes the
 * numbers, so it stays dependency-free and fully testable.
 *
 * One rule for the three renderers: the push-in scales the code inside the body
 * box (everything under the chrome bar), and that box clips at its own, unscaled
 * size. Pushed in, code is cut off under the bar, never drawn over it. The
 * painter clips the body before it scales (`clipBody`, then `applyZoom`); both
 * DOM renderers wrap the code in `FocusZoomBody`, whose clip is not the box that
 * scales.
 *
 * Across, the push-in pivots only as far left of centre as keeps half the margin
 * before the gutter (`zoomOriginX`), and the window's right edge fades over what
 * it carries off (`pushInFade`).
 */
import { clipFadeWidth } from "../layout/canvas-fit";
import { clamp01, easeInOutCubic } from "./engine";

export interface ZoomTransform {
	/** Uniform scale factor (1 = no zoom). */
	scale: number;
	/** Vertical transform origin as a 0..1 ratio of the code body height. */
	originYRatio: number;
}

/** Constant push-in scale applied whenever a step has a spotlight. */
export const ZOOM_SCALE = 1.25;

/** The neutral transform: no scale, centered origin. */
export const NO_ZOOM: ZoomTransform = { scale: 1, originYRatio: 0.5 };

/**
 * Where the push-in pivots across the body, as a 0..1 ratio of its width: the
 * centre, moved left only as far as keeps half the margin before the gutter.
 *
 * The push-in moves `crop = (ZOOM_SCALE - 1) × bodyWidth` out of the window in
 * all, `o × crop` of it on the left for a pivot at `o`. Centred, that tenth of
 * the body was the gutter on any snippet and, on a window cut at the floor's
 * 185 columns, the first dozen columns too (#227). The padding before the gutter
 * (before the code when line numbers are off) is `ZOOM_SCALE × padding` wide as
 * the push-in draws it; the left may give all of it but half the original
 * padding, since digits touching the window's edge read as a crop. So the pivot
 * is that room over the crop (3 × padding / bodyWidth at 1.25), at most the
 * centre: a narrow window keeps its centred push-in, a wide one pivots further
 * left, and the gutter stays at least half a margin inside the window. The
 * ratio is the same in any unit, so each renderer passes its own px.
 */
export function zoomOriginX(input: { padding: number; bodyWidth: number }): number {
	const crop = (ZOOM_SCALE - 1) * input.bodyWidth;
	if (crop <= 0) {
		return 0.5;
	}
	const room = ZOOM_SCALE * input.padding - input.padding / 2;
	return Math.min(0.5, Math.max(0, room / crop));
}

/**
 * The fade over the window's right edge while the push-in carries code past it,
 * or null: at rest, or on a window that already fades its right edge because it
 * cuts a long line (`clipFades`). As deep as that fade, laid by every renderer
 * at window level, outside the push-in, and as opaque as the push-in is far in,
 * so it comes and goes with the zoom instead of popping.
 */
export function pushInFade(input: {
	/** This frame's push-in scale (1 at rest). */
	zoomScale: number;
	windowWidth: number;
	fontSize: number;
	windowCutsRight: boolean;
}): { width: number; opacity: number } | null {
	const opacity = clamp01((input.zoomScale - 1) / (ZOOM_SCALE - 1));
	if (input.windowCutsRight || opacity <= 0) {
		return null;
	}
	return { width: clipFadeWidth(input.windowWidth, input.fontSize), opacity };
}

function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}

/**
 * Zoom for a step's focus over a frame of `lineCount` rows. No focus (or an
 * empty set) is the neutral transform. Otherwise the scale is constant and the
 * origin sits at the vertical center of the focused band: focused lines are
 * 1-indexed, so the band spans grid rows `[minLine-1, maxLine)` and its center
 * row is `(minLine-1 + maxLine)/2`, expressed as a 0..1 ratio and clamped.
 * `firstRow` is the row a long file's window starts on: the body then shows rows
 * from there, so the centre is counted from it.
 */
export function zoomForFocus(
	focus: Set<number> | undefined,
	lineCount: number,
	firstRow = 0,
): ZoomTransform {
	if (!focus || focus.size === 0) {
		return { scale: 1, originYRatio: 0.5 };
	}
	// By iteration: spreading a set into Math.min/max overflows the call stack
	// on a big one.
	let minLine = Number.POSITIVE_INFINITY;
	let maxLine = Number.NEGATIVE_INFINITY;
	for (const line of focus) {
		minLine = Math.min(minLine, line);
		maxLine = Math.max(maxLine, line);
	}
	const lines = Math.max(1, lineCount);
	const center = ((minLine - 1 + maxLine) / 2 - firstRow) / lines;
	return { scale: ZOOM_SCALE, originYRatio: clamp01(center) };
}

/**
 * Interpolate between two zoom transforms at progress `t`, applying `ease` (pass
 * `easeInOutCubic` to match the morph's line-count easing). At t=0 the result is
 * `from`, at t=1 it is `to`.
 */
export function interpolateZoom(
	from: ZoomTransform,
	to: ZoomTransform,
	t: number,
	ease: (t: number) => number = easeInOutCubic,
): ZoomTransform {
	const eased = ease(clamp01(t));
	return {
		scale: lerp(from.scale, to.scale, eased),
		originYRatio: lerp(from.originYRatio, to.originYRatio, eased),
	};
}
