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

import { type MeshPreset, parseMeshBackground } from "../backgrounds/mesh-gradient";
import { type PlanExtent, fitCardToCanvas, tallestFrame } from "../layout/canvas-fit";
import { type ChromeVariant, LINE_HEIGHT_RATIO, chromeBarHeight } from "../layout/frame-metrics";
import type { PaintImage } from "./paint-context";

/** A decoded grain tile, ready to be tiled over the background. */
export interface GrainTile {
	image: PaintImage;
	/** Tile edge in canvas pixels (the CSS `background-size`). */
	size: number;
	/** Opacity of the soft-light layer (the CSS `opacity`). */
	opacity: number;
}

export interface SceneTheme {
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	borderRadius: number;
}

export interface FrameSceneInput {
	canvasWidth: number;
	canvasHeight: number;
	plan: PlanExtent;
	theme: SceneTheme;
	title: string;
	chrome: ChromeVariant;
	/** Background string (`mesh:aurora`, a hex, `transparent`). */
	background: string;
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
	style: {
		theme: SceneTheme;
		title: string;
		chrome: ChromeVariant;
		mesh: MeshPreset | undefined;
		/** Flat fill used when the background is not a mesh. */
		flat: string;
		lineNumberStart: number;
		grain: GrainTile | null;
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
		hasCaption: false,
		scale,
		canvasWidth: input.canvasWidth,
		canvasHeight: input.canvasHeight,
		canvasMargin: input.canvasMargin,
		charWidthRatio,
	});

	const cardWidth = fit.natural.width + 2 * cardPadding;
	const cardHeight = fit.natural.height + 2 * cardPadding;
	const chromeHeight = chromeBarHeight(input.chrome, scale);
	const gutterWidth = gutterColumnWidth(input, charWidth, fontSize);

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
			height: fit.natural.height,
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
		style: {
			theme: input.theme,
			title: input.title,
			chrome: input.chrome,
			mesh: parseMeshBackground(input.background),
			flat: input.background,
			lineNumberStart: input.lineNumberStart,
			grain: input.grain,
		},
	};
}

/**
 * Width of the line-number column, exactly as the DOM lays it out: a border-box
 * flex item whose width is the wider of its `minWidth` of `digits + 1`
 * characters and its content plus the font-size gutter gap. Reproducing the
 * box model here (rather than the video's slightly generous estimate) is what
 * keeps a painted glyph on the same column as the preview's.
 */
function gutterColumnWidth(input: FrameSceneInput, charWidth: number, fontSize: number): number {
	if (!input.showLineNumbers) {
		return 0;
	}
	const lastLine = Math.max(1, Math.floor(input.lineNumberStart)) + tallestFrame(input.plan) - 1;
	const digits = Math.max(2, String(lastLine).length);
	return Math.max((digits + 1) * charWidth, digits * charWidth + fontSize);
}
