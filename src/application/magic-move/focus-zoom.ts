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
 * Horizontally the push-in pivots on the body's centre, unless the code column
 * cuts a long line (`zoomOriginX`): then it pivots on the body's left edge.
 */
import type { LineClip } from "../layout/line-clip";
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
 * centre, or the left edge when the code column cuts a long line (`lineClip`).
 *
 * Centred, a 1.25 push-in carries a tenth of the body off each side. A window
 * cut at the floor's columns is as wide as a window gets, so that tenth was the
 * gutter and the line's first dozen columns, cut mid-glyph (#227), while its
 * right edge already fades (`clipFades`). Pivoting on the left edge, nothing
 * crops on the left: the gutter and the start of every line stay, and the right
 * edge, faded, takes all the push-in carries off. A window whose lines fit
 * pushes in from its centre, as it always has. The cut is one geometry for the
 * whole video, so the pivot never moves between steps.
 */
export function zoomOriginX(lineClip: LineClip | null): number {
	return lineClip ? 0 : 0.5;
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
