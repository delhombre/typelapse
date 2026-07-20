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
	/** Upscale factor the target renders at (the composition's VIDEO_SCALE). */
	scale: number;
	canvasWidth: number;
	canvasHeight: number;
	/** Safe-area margin kept on each side of the canvas (fraction). */
	canvasMargin: number;
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
