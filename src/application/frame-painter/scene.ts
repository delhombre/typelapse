/**
 * Where every part of an exported frame lands: pure geometry, computed once.
 *
 * The browser preview gets its layout from CSS (flex, `ch` units, padding); a
 * canvas gets nothing for free, so the same layout has to be derived in
 * numbers. This module is that derivation, and it reads the shared placement
 * math (`fitCardToCanvas`, `chromeBarHeight`) rather than restating it, so a
 * frame painted here lands where the video and the preview put it.
 *
 * Everything below the card transform is expressed in *card space*: the
 * already-upscaled layout units the DOM renderer works in, before the uniform
 * fit into the canvas. A painter establishes that space once (translate, then
 * scale) and then draws in the same numbers the DOM would use.
 */

import { type Backdrop, parseBackdrop } from "../backgrounds/backdrop";
import {
	type ClipFade,
	type PlanExtent,
	clipFades,
	deepestRow,
	fitCardToCanvas,
} from "../layout/canvas-fit";
import {
	type ChromeVariant,
	LINE_HEIGHT_RATIO,
	captionBlockHeight,
	chromeBarHeight,
	gutterColumnWidth,
} from "../layout/frame-metrics";
import type { LineClip } from "../layout/line-clip";
import type { PaintImage } from "./paint-context";

/** A decoded grain tile, ready to be tiled over the background. */
export interface GrainTile {
	image: PaintImage;
	/** Tile edge in canvas pixels (the CSS `background-size`). */
	size: number;
	/** Opacity of the soft-light layer (the CSS `opacity`). */
	opacity: number;
}

/**
 * A decoded uploaded background, with the intrinsic size the cover fit needs.
 *
 * The size travels alongside the image rather than being read off it, so the
 * painter stays a function of plain numbers and the port stays opaque.
 */
export interface BackdropImage {
	image: PaintImage;
	width: number;
	height: number;
}

export interface SceneTheme {
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	borderRadius: number;
}

/**
 * Mirrors `ReelsProgress`'s own union. The component lives in the presentation
 * layer, which this layer may not import, so the three names are restated here;
 * they are the same three names, and a mismatch fails to type-check at the
 * boundary where the two meet.
 */
export type SceneProgressStyle = "reels" | "bar" | "none";

/** The progress indicator baked over the background, or null when it is off. */
export interface SceneProgress {
	style: SceneProgressStyle;
	/** One reels segment per step. */
	segments: number;
}

/** Text baked into a corner of the canvas, already resolved to its colour. */
export interface SceneWatermark {
	text: string;
	color: string;
}

export interface FrameSceneInput {
	canvasWidth: number;
	canvasHeight: number;
	plan: PlanExtent;
	theme: SceneTheme;
	title: string;
	chrome: ChromeVariant;
	/** Background string: a mesh id, a hex, a CSS gradient, `image:…`, `transparent`. */
	background: string;
	/** The uploaded background, already decoded; null unless one was picked. */
	backdropImage?: BackdropImage | null;
	/** Unscaled code padding. */
	padding: number;
	/** Unscaled mesh border around the window. */
	cardMargin: number;
	showLineNumbers: boolean;
	lineNumberStart: number;
	/** Measured monospace advance ÷ font size, from the painting surface. */
	charWidthRatio: number;
	/** Upscale factor from the 14px editor preview to crisp video text. */
	scale: number;
	/** Safe-area margin kept on each side of the canvas (fraction). */
	canvasMargin: number;
	grain: GrainTile | null;
	/** Apply each frame's push-in transform; off leaves the body untransformed. */
	focusZoom?: boolean;
	progress?: SceneProgress | null;
	watermark?: SceneWatermark | null;
	/**
	 * Every scene's caption. The painter bakes none yet, but both DOM renderers
	 * centre the window and its caption band as one unit, so the card has to
	 * budget the band (its lines, from these) to land where theirs does.
	 */
	captions?: readonly string[];
}

export interface FrameScene {
	canvas: { width: number; height: number };
	/** The upscale factor card space is expressed in (the components' `scale`). */
	unit: number;
	/** Card space: translate to (originX, originY), then scale uniformly. */
	card: { originX: number; originY: number; scale: number; width: number; height: number };
	/** The code window, in card space. */
	window: { x: number; y: number; width: number; height: number; radius: number };
	chromeHeight: number;
	/** Top-left of the first glyph cell, and the grid it sits on (card space). */
	code: { x: number; y: number; charWidth: number; lineHeight: number; fontSize: number };
	/** Right edge the gutter labels are aligned to, or null when they are off. */
	gutter: { textRight: number } | null;
	/** Fades over the edges the window clips at the readable floor, window space. */
	fades: ClipFade[];
	/** Where the code column cuts its longest line and fades it, in cells, or null. */
	lineClip: LineClip | null;
	style: {
		theme: SceneTheme;
		title: string;
		chrome: ChromeVariant;
		backdrop: Backdrop;
		backdropImage: BackdropImage | null;
		lineNumberStart: number;
		grain: GrainTile | null;
		focusZoom: boolean;
		progress: SceneProgress | null;
		watermark: SceneWatermark | null;
	};
}

/** Resolve one frame's full geometry from the snippet's own settings. */
export function frameScene(input: FrameSceneInput): FrameScene {
	const { scale, charWidthRatio } = input;
	const fontSize = input.theme.fontSize * scale;
	const padding = input.padding * scale;
	const cardPadding = input.cardMargin * scale;
	const charWidth = fontSize * charWidthRatio;
	const lineHeight = fontSize * LINE_HEIGHT_RATIO;

	const fit = fitCardToCanvas({
		plan: input.plan,
		chrome: input.chrome,
		fontSize: input.theme.fontSize,
		padding: input.padding,
		cardMargin: input.cardMargin,
		showLineNumbers: input.showLineNumbers,
		lineNumberStart: input.lineNumberStart,
		captions: input.captions ?? [],
		scale,
		canvasWidth: input.canvasWidth,
		canvasHeight: input.canvasHeight,
		canvasMargin: input.canvasMargin,
		charWidthRatio,
	});

	const cardWidth = fit.natural.width + 2 * cardPadding;
	const cardHeight = fit.natural.height + 2 * cardPadding;
	// The window is the unit less its caption band, which hangs below it.
	const windowHeight = fit.natural.height - captionBlockHeight(fit.captionLines, scale);
	const chromeHeight = chromeBarHeight(input.chrome, scale);
	const gutterWidth = gutterWidthOf(input, charWidth, fontSize);

	return {
		canvas: { width: input.canvasWidth, height: input.canvasHeight },
		unit: scale,
		card: {
			originX: (input.canvasWidth - cardWidth * fit.scale) / 2,
			originY: (input.canvasHeight - cardHeight * fit.scale) / 2,
			scale: fit.scale,
			width: cardWidth,
			height: cardHeight,
		},
		window: {
			x: cardPadding,
			y: cardPadding,
			width: fit.natural.width,
			height: windowHeight,
			radius: input.theme.borderRadius * scale,
		},
		chromeHeight,
		code: {
			x: cardPadding + padding + gutterWidth,
			y: cardPadding + chromeHeight + padding,
			charWidth,
			lineHeight,
			fontSize,
		},
		gutter: gutterWidth > 0 ? { textRight: cardPadding + padding + gutterWidth - fontSize } : null,
		fades: clipFades({
			clip: fit.clip,
			windowWidth: fit.natural.width,
			windowHeight,
			chromeHeight,
			fontSize,
		}),
		lineClip: fit.lineClip,
		style: {
			theme: input.theme,
			title: input.title,
			chrome: input.chrome,
			backdrop: parseBackdrop(input.background),
			backdropImage: input.backdropImage ?? null,
			lineNumberStart: input.lineNumberStart,
			grain: input.grain,
			focusZoom: input.focusZoom ?? false,
			progress: input.progress ?? null,
			watermark: input.watermark ?? null,
		},
	};
}

/** Width of the line-number column, as the DOM lays it out (`gutterColumnWidth`). */
function gutterWidthOf(input: FrameSceneInput, charWidth: number, fontSize: number): number {
	return gutterColumnWidth({
		showLineNumbers: input.showLineNumbers,
		lastLine: Math.max(1, Math.floor(input.lineNumberStart)) + deepestRow(input.plan) - 1,
		charWidth,
		fontSize,
	});
}
