import { fitScale } from "./fit-scale";
import { type ChromeVariant, frameNaturalSize } from "./frame-metrics";

/**
 * Where the code card lands inside the export canvas: pure and dependency-free.
 *
 * The Remotion composition centers the code window on a full-aspect mesh canvas
 * (e.g. 1080x1920 for 9:16), fit-scaled with a safe-area margin. This module is
 * the single source of that placement math, so the browser social preview and
 * the exported video put the window at the exact same fraction of the canvas:
 * the guides then mark the real occluded regions instead of lying over the code.
 */

/**
 * The tier the card's natural size was tuned against. A 1080p canvas renders at
 * the base scale exactly, so every export that existed before resolution tiers
 * is unchanged to the pixel.
 */
export const REFERENCE_SHORT_EDGE = 1080;

/**
 * Upscale factor from the 14px editor type to crisp video text at the reference
 * 1080p tier; higher tiers multiply it by their share of that short edge (see
 * `renderScaleFor`). One constant for the three renderers: the preview, the
 * composition and the painter each used to keep their own copy of it.
 */
export const BASE_VIDEO_SCALE = 2.2;

/** Safe-area margin kept on each side of the canvas the card is fit into. */
export const CANVAS_MARGIN = 0.05;

/**
 * The upscale factor a canvas of this size should draw the card at.
 *
 * `fitScale` never enlarges, so a fixed scale would make a higher tier a bigger
 * empty background rather than a sharper video: at 4K the card would occupy half
 * the framing it does at 1080p. Growing the scale with the canvas's SHORT edge
 * (the same edge the tier is named after) keeps the card at one constant
 * fraction of the frame, so a tier buys pixels and never reframes the shot.
 *
 * Degenerate canvases fall back to the base scale: there is nothing to fit.
 */
export function renderScaleFor(
	canvasWidth: number,
	canvasHeight: number,
	baseScale: number,
): number {
	if (canvasWidth <= 0 || canvasHeight <= 0) {
		return baseScale;
	}
	return (baseScale * Math.min(canvasWidth, canvasHeight)) / REFERENCE_SHORT_EDGE;
}

/** Minimal structural shape of a laid-out plan needed to size the card. */
export interface PlanExtent {
	frames: { lineCount: number; tokens: { col: number; content: string }[] }[];
}

/** Widest line across every frame, in characters (col + token length). */
export function widestColumn(plan: PlanExtent): number {
	let max = 0;
	for (const frame of plan.frames) {
		for (const token of frame.tokens) {
			max = Math.max(max, token.col + token.content.length);
		}
	}
	return max;
}

/** Tallest frame across the plan, in rows (never below 1). */
export function tallestFrame(plan: PlanExtent): number {
	let max = 1;
	for (const frame of plan.frames) {
		max = Math.max(max, frame.lineCount);
	}
	return max;
}

export interface CardCanvasFitInput {
	plan: PlanExtent;
	chrome: ChromeVariant;
	/** Unscaled font size (theme.fontSize). */
	fontSize: number;
	/** Unscaled code padding (framePadding). */
	padding: number;
	/** Unscaled mesh margin (cardMargin). */
	cardMargin: number;
	showLineNumbers: boolean;
	lineNumberStart: number;
	hasCaption: boolean;
	/** Upscale factor the target renders at (see `renderScaleFor`). */
	scale: number;
	canvasWidth: number;
	canvasHeight: number;
	/** Safe-area margin kept on each side of the canvas (fraction). */
	canvasMargin: number;
	/**
	 * Monospace advance ÷ font size, from `measureCharWidthRatio` in the font the
	 * target paints with. Required: a card sized on any other number is wider or
	 * narrower than the glyphs inside it.
	 */
	charWidthRatio: number;
}

export interface CardCanvasFit {
	/** Natural (already-scaled) size of the window + caption unit. */
	natural: { width: number; height: number };
	/** Fit factor of the padded card into the safe-area canvas. */
	scale: number;
	/** Padded card's fraction of the canvas width, in (0, 1]. */
	widthFraction: number;
	/** Padded card's fraction of the canvas height, in (0, 1]. */
	heightFraction: number;
}

/**
 * Fit the code card (window + mesh margin) into the export canvas exactly as the
 * Remotion composition does: derive the natural size on the monospace grid, wrap
 * it in the mesh margin, and fit that padded card into the canvas minus the
 * safe-area margin. Returns the fit scale and the card's fraction of the canvas
 * on each axis, so a caller can place the same window at the same proportion.
 */
export function fitCardToCanvas(input: CardCanvasFitInput): CardCanvasFit {
	const natural = frameNaturalSize({
		chrome: input.chrome,
		maxCols: widestColumn(input.plan),
		maxLines: tallestFrame(input.plan),
		fontSize: input.fontSize * input.scale,
		padding: input.padding * input.scale,
		showLineNumbers: input.showLineNumbers,
		lineNumberStart: input.lineNumberStart,
		hasCaption: input.hasCaption,
		scale: input.scale,
		charWidthRatio: input.charWidthRatio,
	});
	const cardPadding = input.cardMargin * input.scale;
	const paddedWidth = natural.width + 2 * cardPadding;
	const paddedHeight = natural.height + 2 * cardPadding;
	const scale = fitScale(
		paddedWidth,
		paddedHeight,
		input.canvasWidth * (1 - 2 * input.canvasMargin),
		input.canvasHeight * (1 - 2 * input.canvasMargin),
	);
	return {
		natural,
		scale,
		widthFraction: (paddedWidth * scale) / input.canvasWidth,
		heightFraction: (paddedHeight * scale) / input.canvasHeight,
	};
}

export interface PreviewCardPlacementInput
	extends Omit<CardCanvasFitInput, "scale" | "canvasMargin"> {
	/** Width of the aspect box the preview draws the canvas into, in CSS px. */
	boxWidth: number;
}

export interface PreviewCardPlacement {
	/** The window's width at editor size (unscaled px), before `cardScale`. */
	windowWidth: number;
	/** Box px per editor px: the one transform that puts the card in the box. */
	cardScale: number;
}

/**
 * How the DOM preview draws the exporters' card inside its aspect box.
 *
 * The preview lays the card out at editor size (14px type, unscaled padding and
 * margin), so it takes the exporters' window width divided by their render scale,
 * and one transform that carries editor px to box px: the render scale, the fit,
 * and the box's own share of the canvas. Laid out any other way (it used to be a
 * fixed 42rem card squeezed into the slot) the window and the type each come out
 * a different size from the export's.
 */
export function previewCardPlacement(input: PreviewCardPlacementInput): PreviewCardPlacement {
	const unit = renderScaleFor(input.canvasWidth, input.canvasHeight, BASE_VIDEO_SCALE);
	const fit = fitCardToCanvas({ ...input, scale: unit, canvasMargin: CANVAS_MARGIN });
	return {
		windowWidth: fit.natural.width / unit,
		cardScale: (unit * fit.scale * input.boxWidth) / input.canvasWidth,
	};
}
