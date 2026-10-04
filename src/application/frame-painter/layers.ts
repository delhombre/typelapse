/**
 * The scene's text and image layers, painted the way the DOM lays them out.
 *
 * Both DOM renderers draw a layer as an absolutely positioned box on the
 * project canvas: a text layer is `MultimediaTextLayerContent` (a centring flex
 * box, `white-space: pre-wrap`, clipped), an image layer is an overflow-hidden,
 * rounded box holding the image at the shared media fit. A canvas gets none of
 * that for free, so this restates it in numbers: line breaking, the centred
 * block, the baseline CSS gives each line, the rounded clip.
 *
 * Layers are expressed in project canvas pixels, the units the document and the
 * preview's layer surface use; one uniform scale carries them to the export
 * canvas, exactly as the preview scales its whole surface into the aspect box.
 */

import type { MediaRect } from "../layout/media-fit";
import type { TextLayerVisual } from "../render/scene-layer-visuals";
import { canvasFont } from "./font";
import type { PaintContext, PaintImage } from "./paint-context";
import { CssBaselines } from "./text";

export interface PaintBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type PaintLayer =
	| {
			kind: "text";
			/** The layer's box on the project canvas. */
			box: PaintBox;
			opacity: number;
			text: string;
			visual: TextLayerVisual;
	  }
	| {
			kind: "image";
			box: PaintBox;
			opacity: number;
			/** CSS `border-radius` of the box, in project canvas px. */
			radius: number;
			image: PaintImage;
			/** Where the fitted image lands, relative to the box (`projectFittedMediaRect`). */
			media: MediaRect;
	  };

/** A context and the image it paints into, for compositing a group at an opacity. */
export interface ScratchSurface {
	ctx: PaintContext;
	image: PaintImage;
}

/** One frame's layers around the code card, already resolved by the scene compiler. */
export interface LayeredFrame {
	/** Export canvas px per project canvas px. */
	surfaceScale: number;
	/** Layers authored before the primary code, painted under the card. */
	under: PaintLayer[];
	/** Layers authored after it, painted over the card. */
	over: PaintLayer[];
	/** The card's own opacity this frame; 0 leaves it out. */
	codeOpacity: number;
	/**
	 * Where a translucent card is painted before it is composited. CSS opacity
	 * fades the card as one picture; a canvas fading each draw instead would let
	 * the window's fill show through every glyph on top of it.
	 */
	scratch?: ScratchSurface;
}

/** Below this a layer is invisible; painting it costs draw calls for nothing. */
const INVISIBLE = 0.001;

export function paintLayers(ctx: PaintContext, layers: PaintLayer[], surfaceScale: number): void {
	if (layers.length === 0) {
		return;
	}
	ctx.save();
	ctx.scale(surfaceScale, surfaceScale);
	for (const layer of layers) {
		if (layer.opacity <= INVISIBLE) {
			continue;
		}
		ctx.save();
		ctx.globalAlpha = Math.min(1, layer.opacity);
		if (layer.kind === "text") {
			paintText(ctx, layer);
		} else {
			paintImage(ctx, layer);
		}
		ctx.restore();
	}
	ctx.restore();
	// `restore` brings these back on a real context; set them anyway so a context
	// that only records what it is told never leaks a fade into the card.
	ctx.globalAlpha = 1;
}

function paintImage(ctx: PaintContext, layer: Extract<PaintLayer, { kind: "image" }>): void {
	const { box, media } = layer;
	ctx.beginPath();
	ctx.roundRect(box.x, box.y, box.width, box.height, layer.radius);
	ctx.clip();
	// The browser filters a scaled `<img>` with a high-quality kernel; the
	// context's default is bilinear, which aliases a photo shrunk into a card.
	if (ctx.imageSmoothingQuality !== undefined) {
		ctx.imageSmoothingQuality = "high";
	}
	ctx.drawImage(layer.image, box.x + media.x, box.y + media.y, media.width, media.height);
}

function paintText(ctx: PaintContext, layer: Extract<PaintLayer, { kind: "text" }>): void {
	const { box, visual } = layer;
	ctx.beginPath();
	ctx.rect(box.x, box.y, box.width, box.height);
	ctx.clip();

	ctx.font = canvasFont(visual.fontSize, visual.fontFamily, undefined, visual.fontWeight);
	// Rounded to a hundredth of a pixel: `-0.035 * 100` is -3.5000000000000004,
	// and a context keeps the string it was given.
	ctx.letterSpacing = `${Number(trackingPx(visual.letterSpacing, visual.fontSize).toFixed(2))}px`;
	ctx.fillStyle = visual.color;
	ctx.textAlign = "left";

	const lines = wrapLines(ctx, layer.text, box.width);
	const lineHeight = visual.lineHeight * visual.fontSize;
	// `align-items: center` centres the block of lines, overflowing both edges
	// equally when it is taller than the box (the clip then cuts both).
	const top = box.y + (box.height - lines.length * lineHeight) / 2;
	const baselines = new CssBaselines(ctx);
	for (const [index, line] of lines.entries()) {
		const y = baselines.at(top + (index + 0.5) * lineHeight, lineHeight);
		ctx.fillText(line, lineX(box, visual.textAlign, ctx.measureText(line).width), y);
	}
}

/**
 * The line's left edge. The flex item is as wide as its longest line (at most
 * the box), placed by `justify-content`, and each line is aligned inside it by
 * `text-align` on the same side, which puts every line against the box's own
 * edge or centre: one rule for both properties.
 */
function lineX(box: PaintBox, align: TextLayerVisual["textAlign"], width: number): number {
	if (align === "left") {
		return box.x;
	}
	if (align === "right") {
		return box.x + box.width - width;
	}
	return box.x + (box.width - width) / 2;
}

/** CSS tracking in `em`, as the pixel length a context's `letterSpacing` takes. */
function trackingPx(letterSpacing: string, fontSize: number): number {
	const em = /^(-?[\d.]+)em$/.exec(letterSpacing.trim());
	if (em) {
		return Number(em[1]) * fontSize;
	}
	const px = /^(-?[\d.]+)px$/.exec(letterSpacing.trim());
	return px ? Number(px[1]) : 0;
}

/**
 * The lines `white-space: pre-wrap` makes of a string in a box this wide, in
 * the context's current font and tracking.
 *
 * The author's own line breaks are kept; a line wider than the box breaks at
 * the last space that fits; a single word wider than the box overflows rather
 * than breaking inside it (`overflow-wrap: normal`). Spaces at the end of a
 * wrapped line hang, so they are dropped before the line is aligned.
 */
export function wrapLines(ctx: PaintContext, text: string, maxWidth: number): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		const pieces = paragraph.split(/(\s+)/).filter((piece) => piece !== "");
		let line = "";
		for (const piece of pieces) {
			const candidate = line + piece;
			const isSpace = /^\s+$/.test(piece);
			if (line !== "" && !isSpace && ctx.measureText(candidate.trimEnd()).width > maxWidth) {
				lines.push(line.trimEnd());
				line = piece;
				continue;
			}
			line = candidate;
		}
		lines.push(line.trimEnd());
	}
	return lines;
}
