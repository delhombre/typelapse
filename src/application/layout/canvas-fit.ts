import { displayWidth } from "../text/display-width";
import { fitScale } from "./fit-scale";
import {
	type ChromeVariant,
	LINE_HEIGHT_RATIO,
	captionBlockHeight,
	frameNaturalSize,
} from "./frame-metrics";

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
 * The smallest code text a card is drawn at: 8 px on a canvas whose short edge is
 * `REFERENCE_SHORT_EDGE`, growing with the tier like everything else (16 px at
 * 4K). Without it the fit shrank a 10,000-character line or a 3,000-line file
 * until the card was a dot. Below the floor the card stops shrinking and the
 * window clips what does not fit, with a fade on the clipped edge
 * (`clipFades`). A card whose fit stays above the floor is drawn as before.
 */
export const MIN_TEXT_PX = 8;

/**
 * The tallest shipped canvas, long edge over short edge (9:16 and 16:9 in
 * `render-config`'s `ASPECT_RATIOS`), and the narrowest advance a monospace code
 * font measures (JetBrains Mono and its peers measure 0.6).
 */
const LONGEST_EDGE_RATIO = 16 / 9;
const NARROWEST_CHAR_WIDTH_RATIO = 0.5;
/** Rows and columns past what the floor can show still glide into view through a
 *  morph, so the window keeps half as much again below and to the right. */
const WINDOW_MARGIN = 1.5;
const FLOOR_SAFE_LONG_EDGE = LONGEST_EDGE_RATIO * REFERENCE_SHORT_EDGE * (1 - 2 * CANVAS_MARGIN);

/**
 * The most rows a card can show at the floor on any shipped canvas, with the
 * margin: the magic-move plan lays out no line past it, so a 3,000-line file
 * costs what a 200-line one does. Every renderer reads the same windowed plan,
 * so the server, the painter and the preview draw the same frames.
 */
export const VISIBLE_ROW_LIMIT = Math.ceil(
	(WINDOW_MARGIN * FLOOR_SAFE_LONG_EDGE) / (MIN_TEXT_PX * LINE_HEIGHT_RATIO),
);

/** The most columns a card can show at the floor, with the margin. */
export const VISIBLE_COL_LIMIT = Math.ceil(
	(WINDOW_MARGIN * FLOOR_SAFE_LONG_EDGE) / (MIN_TEXT_PX * NARROWEST_CHAR_WIDTH_RATIO),
);

/**
 * The fit scale below which this card's code would draw under `MIN_TEXT_PX`.
 * Never above 1: the fit never enlarges, so a huge type size has nothing to floor.
 */
export function readableFitFloor(
	fontSize: number,
	scale: number,
	canvasWidth: number,
	canvasHeight: number,
): number {
	const shortEdge = Math.min(canvasWidth, canvasHeight);
	if (fontSize <= 0 || scale <= 0 || shortEdge <= 0) {
		return 0;
	}
	return Math.min(1, (MIN_TEXT_PX * shortEdge) / (REFERENCE_SHORT_EDGE * fontSize * scale));
}

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
	frames: { lineCount: number; tokens: { col: number; content: string }[]; firstRow?: number }[];
}

/** Widest line across every frame, in display cells (col + the token's cells). */
export function widestColumn(plan: PlanExtent): number {
	let max = 0;
	for (const frame of plan.frames) {
		for (const token of frame.tokens) {
			max = Math.max(max, token.col + displayWidth(token.content));
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

/**
 * One past the deepest row any frame shows: its window's first row plus its
 * rows. What the gutter's digits are sized for; `tallestFrame` for a file whose
 * window never moves off the top.
 */
export function deepestRow(plan: PlanExtent): number {
	let max = 1;
	for (const frame of plan.frames) {
		max = Math.max(max, (frame.firstRow ?? 0) + frame.lineCount);
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
	/** Every scene's caption (blank for none), which the card budgets a band for. */
	captions: readonly string[];
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

/** Which edges of the window cut its code off, at the readable floor. */
export interface CardClip {
	right: boolean;
	bottom: boolean;
}

export interface CardCanvasFit {
	/** Size of the window + caption unit as drawn (already scaled): the natural
	 *  size, cut to what fits the canvas at the readable floor. */
	natural: { width: number; height: number };
	/** The window alone: `natural.height` less the caption band under it. */
	windowHeight: number;
	/** Lines the caption band reserves (0, 1 or 2); `StepCaption` is drawn at this count. */
	captionLines: number;
	/** The edges the window clips at the floor, or null when everything fits. */
	clip: CardClip | null;
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
		// The gutter is as wide as the deepest label a moved window shows.
		lineNumberStart: input.lineNumberStart + deepestRow(input.plan) - tallestFrame(input.plan),
		captions: input.captions,
		scale: input.scale,
		charWidthRatio: input.charWidthRatio,
	});
	const cardPadding = input.cardMargin * input.scale;
	const safeWidth = input.canvasWidth * (1 - 2 * input.canvasMargin);
	const safeHeight = input.canvasHeight * (1 - 2 * input.canvasMargin);
	const fitted = fitScale(
		natural.width + 2 * cardPadding,
		natural.height + 2 * cardPadding,
		safeWidth,
		safeHeight,
	);
	const floor = readableFitFloor(
		input.fontSize,
		input.scale,
		input.canvasWidth,
		input.canvasHeight,
	);
	const scale = Math.max(fitted, floor);
	const drawn =
		scale > fitted
			? {
					width: Math.min(natural.width, safeWidth / scale - 2 * cardPadding),
					height: Math.min(natural.height, safeHeight / scale - 2 * cardPadding),
				}
			: natural;
	const clip =
		drawn === natural
			? null
			: { right: drawn.width < natural.width, bottom: drawn.height < natural.height };
	return {
		natural: drawn,
		windowHeight: drawn.height - captionBlockHeight(natural.captionLines, input.scale),
		captionLines: natural.captionLines,
		clip,
		scale,
		widthFraction: ((drawn.width + 2 * cardPadding) * scale) / input.canvasWidth,
		heightFraction: ((drawn.height + 2 * cardPadding) * scale) / input.canvasHeight,
	};
}

/** One fade laid over a clipped edge, in the window's own px. */
export interface ClipFade {
	edge: "right" | "bottom";
	x: number;
	y: number;
	width: number;
	height: number;
}

/** How deep each fade reaches into the window, in font sizes. */
const CLIP_FADE_EMS = { right: 4, bottom: 2.5 } as const;

/**
 * The fades over a clipped window: a gradient from the window's own background,
 * transparent, to opaque at the cut, so clipped code trails off instead of being
 * guillotined mid-glyph. The right fade covers the code body under the chrome
 * bar; the bottom fade spans the window. All three renderers lay these rects.
 */
export function clipFades(input: {
	clip: CardClip | null;
	windowWidth: number;
	windowHeight: number;
	chromeHeight: number;
	fontSize: number;
}): ClipFade[] {
	const { clip, windowWidth, windowHeight, chromeHeight, fontSize } = input;
	const fades: ClipFade[] = [];
	if (clip?.right) {
		const width = Math.min(windowWidth, CLIP_FADE_EMS.right * fontSize);
		fades.push({
			edge: "right",
			x: windowWidth - width,
			y: chromeHeight,
			width,
			height: windowHeight - chromeHeight,
		});
	}
	if (clip?.bottom) {
		const height = Math.min(windowHeight - chromeHeight, CLIP_FADE_EMS.bottom * fontSize);
		fades.push({ edge: "bottom", x: 0, y: windowHeight - height, width: windowWidth, height });
	}
	return fades;
}

/** The fade's two colour stops: the window background, transparent then opaque.
 *  Same hue at both ends, so CSS (premultiplied) and canvas gradients agree. */
export function clipFadeStops(background: string): [string, string] {
	return /^#[0-9a-f]{6}$/i.test(background)
		? [`${background}00`, background]
		: ["transparent", background];
}

export interface PreviewCardPlacementInput
	extends Omit<CardCanvasFitInput, "scale" | "canvasMargin"> {
	/** Width of the aspect box the preview draws the canvas into, in CSS px. */
	boxWidth: number;
}

export interface PreviewCardPlacement {
	/** Lines the caption band reserves, as the exporters draw it. */
	captionLines: number;
	/** The window's width at editor size (unscaled px), before `cardScale`. */
	windowWidth: number;
	/** The window's height at editor size: the most it may grow before it clips. */
	windowHeight: number;
	/** The edges the window clips at the readable floor, or null. */
	clip: CardClip | null;
	/** Box px per editor px: the one transform that puts the card in the box. */
	cardScale: number;
	/**
	 * Editor px to the px the preview lays its card out at: the exporters' render
	 * scale, the size the composition lays the card out at. The preview multiplies
	 * its editor sizes by this and divides `cardScale` by it. CSS rounds a line's
	 * ascent, descent and half-leading to whole CSS px of the size it lays out at
	 * (16 px at 14 px type, 35 px at 30.8 px), so a card laid out at editor size
	 * and scaled 2.2x put its rows on a 2.2 px grid, up to 1.1 px off (#114).
	 */
	layoutScale: number;
}

/**
 * How the DOM preview draws the exporters' card inside its aspect box.
 *
 * In editor px (14px type, unscaled padding and margin): the exporters' window
 * width divided by their render scale, and one transform that carries editor px
 * to box px: the render scale, the fit, and the box's own share of the canvas.
 * The preview multiplies the first by `layoutScale` and divides the second by
 * it, so it lays out at the composition's size. Laid out any other way (it used
 * to be a fixed 42rem card squeezed into the slot) the window and the type each
 * come out a different size from the export's.
 */
export function previewCardPlacement(input: PreviewCardPlacementInput): PreviewCardPlacement {
	const unit = renderScaleFor(input.canvasWidth, input.canvasHeight, BASE_VIDEO_SCALE);
	const fit = fitCardToCanvas({ ...input, scale: unit, canvasMargin: CANVAS_MARGIN });
	return {
		windowWidth: fit.natural.width / unit,
		windowHeight: fit.windowHeight / unit,
		captionLines: fit.captionLines,
		clip: fit.clip,
		cardScale: (unit * fit.scale * input.boxWidth) / input.canvasWidth,
		layoutScale: unit,
	};
}
