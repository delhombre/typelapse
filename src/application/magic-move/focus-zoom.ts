/**
 * Focus zoom — pure. Turns a step's spotlight (the set of focused line numbers)
 * into a cinematic push-in: a constant scale and a vertical origin centered on
 * the focused band. Shared by the browser preview and the Remotion video so the
 * export pushes in exactly like the preview (WYSIWYG).
 *
 * The transform is applied by the renderer as `scale(scale)` with
 * `transform-origin: 50% {originYRatio * 100%}`; this module only computes the
 * numbers, so it stays dependency-free and fully testable.
 */
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

function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}

/**
 * Zoom for a step's focus over a frame of `lineCount` rows. No focus (or an
 * empty set) is the neutral transform. Otherwise the scale is constant and the
 * origin sits at the vertical center of the focused band: focused lines are
 * 1-indexed, so the band spans grid rows `[minLine-1, maxLine)` and its center
 * row is `(minLine-1 + maxLine)/2`, expressed as a 0..1 ratio and clamped.
 */
export function zoomForFocus(focus: Set<number> | undefined, lineCount: number): ZoomTransform {
	if (!focus || focus.size === 0) {
		return { scale: 1, originYRatio: 0.5 };
	}
	const focused = [...focus];
	const minLine = Math.min(...focused);
	const maxLine = Math.max(...focused);
	const lines = Math.max(1, lineCount);
	const center = (minLine - 1 + maxLine) / 2 / lines;
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
