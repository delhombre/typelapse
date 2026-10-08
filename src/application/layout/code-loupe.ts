/**
 * The phone's loupe: the frame magnified until its code can be read.
 *
 * A 1080p frame fit to a 374px stage draws its code at 2 to 6px (design audit
 * 2026-10-08, D5). A tap grows the same picture over the whole screen, at the
 * scale that brings the code to an 11px floor, and a finger pans it. Nothing is
 * redrawn: the DOM preview is scaled by a transform, so the loupe shows exactly
 * what the video will (DECISIONS D12). This module is the arithmetic of that
 * transform, in screen pixels, with no DOM in it.
 *
 * A view maps a point of the frame at rest to the screen: `x + scale * point`.
 * The rest view is the identity, so every rect here is measured on the page with
 * the loupe shut, where what is drawn is where it lies.
 */

export interface LoupeRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface LoupePoint {
	x: number;
	y: number;
}

/** Screen = (x, y) + scale * rest point. */
export interface LoupeView {
	scale: number;
	x: number;
	y: number;
}

/** The range the view's offset may take at a given scale. */
export interface LoupeBounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/** The effective code size the loupe brings the frame to, in CSS px. */
export const LOUPE_FLOOR_PX = 11;
/** The least the loupe magnifies, so a tap on code already near the floor still reads as a zoom. */
export const LOUPE_FIT_BOOST = 1.25;
/** Between the code window's edges and the screen's, at every edge the pan can reach. */
export const LOUPE_MARGIN = 12;
/** The Done chip's row: 10px from the top inset, 44px tall, 4px clear of the code. */
export const LOUPE_TOP = 58;
/** Above the home indicator. */
export const LOUPE_BOTTOM = 24;
/** How far past the window's top a pull has to go to close the loupe. */
export const LOUPE_CLOSE_PULL = 72;
/** One arrow key's move. */
export const LOUPE_KEY_STEP = 48;
/** How much of the finger's speed a release carries, in seconds of travel. */
const MOMENTUM_SECONDS = 0.32;
/** The rubber band's give: the iOS scroll view's constant. */
const RUBBER = 0.55;

export const LOUPE_REST: LoupeView = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The magnification, from the code's effective size at rest. */
export function loupeScale(codePx: number, floorPx: number = LOUPE_FLOOR_PX): number {
	return Math.max(floorPx / codePx, LOUPE_FIT_BOOST);
}

/** Where the code is laid out while the loupe is open: under the Done chip, above the home indicator. */
export function loupeViewport(screen: {
	width: number;
	height: number;
	safeTop: number;
	safeBottom: number;
}): LoupeRect {
	const top = screen.safeTop + LOUPE_TOP;
	return {
		x: 0,
		y: top,
		width: screen.width,
		height: screen.height - top - LOUPE_BOTTOM - screen.safeBottom,
	};
}

/** One axis: the offsets that keep [start, start + size] (rest px) covering the view, or centred in it. */
function axisBounds(
	scale: number,
	viewStart: number,
	viewSize: number,
	start: number,
	size: number,
) {
	const drawn = size * scale;
	if (drawn >= viewSize) {
		return { min: viewStart + viewSize - scale * (start + size), max: viewStart - scale * start };
	}
	const centred = viewStart + (viewSize - drawn) / 2 - scale * start;
	return { min: centred, max: centred };
}

/**
 * The pan's range: the code window, with the margin around it, either covers
 * the view (and may move until one of its edges meets the view's) or is
 * centred in it on that axis.
 */
export function loupeBounds(scale: number, viewport: LoupeRect, window: LoupeRect): LoupeBounds {
	const margin = LOUPE_MARGIN / scale;
	const x = axisBounds(
		scale,
		viewport.x,
		viewport.width,
		window.x - margin,
		window.width + 2 * margin,
	);
	const y = axisBounds(
		scale,
		viewport.y,
		viewport.height,
		window.y - margin,
		window.height + 2 * margin,
	);
	return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
}

function clampView(view: LoupeView, bounds: LoupeBounds): LoupeView {
	return {
		scale: view.scale,
		x: clamp(view.x, bounds.minX, bounds.maxX),
		y: clamp(view.y, bounds.minY, bounds.maxY),
	};
}

/**
 * The open view. Horizontally the window's left edge sits on the margin,
 * because code is read from column 1; vertically the tapped line stays under
 * the finger. With no point (the keyboard) the window's top-left corner does.
 * Either is then held inside the pan's bounds.
 */
export function openLoupe(input: {
	scale: number;
	viewport: LoupeRect;
	window: LoupeRect;
	/** The finger, on the screen. */
	tap?: LoupePoint;
	/** The view the tapped picture was drawn with: the rest view, or a loupe still closing. */
	from?: LoupeView;
}): LoupeView {
	const { scale, viewport, window, tap, from = LOUPE_REST } = input;
	const x = viewport.x + LOUPE_MARGIN - scale * window.x;
	const y = tap
		? tap.y - scale * ((tap.y - from.y) / from.scale)
		: viewport.y + LOUPE_MARGIN - scale * window.y;
	return clampView({ scale, x, y }, loupeBounds(scale, viewport, window));
}

/** Past an edge a finger moves the code less and less: it can stretch, never escape. */
export function rubberBand(value: number, min: number, max: number, dimension: number): number {
	const give = (over: number) =>
		(1 - 1 / ((Math.abs(over) * RUBBER) / dimension + 1)) * dimension * Math.sign(over);
	if (value < min) return min + give(value - min);
	if (value > max) return max + give(value - max);
	return value;
}

/** Where a released pan settles: a third of a second of its speed further, inside the bounds. */
export function releaseLoupe(
	offset: LoupePoint,
	velocity: LoupePoint,
	bounds: LoupeBounds,
): LoupePoint {
	return {
		x: clamp(offset.x + velocity.x * MOMENTUM_SECONDS, bounds.minX, bounds.maxX),
		y: clamp(offset.y + velocity.y * MOMENTUM_SECONDS, bounds.minY, bounds.maxY),
	};
}

/** A pull down past the window's top, by more than the threshold, closes the loupe. */
export function pulledToClose(rawY: number, bounds: LoupeBounds): boolean {
	return rawY - bounds.maxY > LOUPE_CLOSE_PULL;
}

export type LoupeArrow = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

const ARROWS: Record<LoupeArrow, LoupePoint> = {
	// The arrow names the way the reader looks: right reads further right, so the code moves left.
	ArrowLeft: { x: 1, y: 0 },
	ArrowRight: { x: -1, y: 0 },
	ArrowUp: { x: 0, y: 1 },
	ArrowDown: { x: 0, y: -1 },
};

export function isLoupeArrow(key: string): key is LoupeArrow {
	return key in ARROWS;
}

/** One arrow key's pan, inside the bounds. */
export function nudgeLoupe(view: LoupeView, key: LoupeArrow, bounds: LoupeBounds): LoupeView {
	const step = ARROWS[key];
	return clampView(
		{ ...view, x: view.x + step.x * LOUPE_KEY_STEP, y: view.y + step.y * LOUPE_KEY_STEP },
		bounds,
	);
}
