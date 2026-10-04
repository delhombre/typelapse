import { canvasFont } from "../frame-painter/font";
import { BASE_VIDEO_SCALE } from "./canvas-fit";

/**
 * The monospace advance every renderer sizes the card on.
 *
 * Glyphs land on the advance of the font the renderer actually resolved: the
 * DOM preview and the composition place tokens in `ch`, the painter at
 * `measureText("0")` steps. The card used to be sized on a nominal 0.62 the
 * server assumed, while the painter measured 0.60 and the preview ignored both,
 * so the three windows came out 1263, 1227 and 1270 px wide at 1080p. Every
 * scope now asks this function instead: the same glyph, at the same size, in the
 * font that scope will paint with. Each scope still measures its own font
 * (a worker, a tab and a headless Chrome do not share one), and
 * `advanceDriftMessage` is the net when two of them disagree.
 */

/** Just the part of a 2D context the measurement needs. */
export interface AdvanceMeter {
	font: string;
	measureText(text: string): { width: number };
}

/** The glyph `ch` is defined on, so the canvas and CSS answer the same question. */
const PROBE_GLYPH = "0";

/**
 * The `font` shorthand the probe is set in: the base video size rather than a
 * tier's, because the answer is divided by the size and two scopes have to
 * probe the same size for their answers to be comparable at all.
 */
export function advanceProbeFont(fontFamily: string, fontSize: number): string {
	return canvasFont(fontSize * BASE_VIDEO_SCALE, fontFamily);
}

/**
 * Advance of `0` ÷ font size, in the font `ctx` resolves for this family. Load
 * the family first (`document.fonts.load(advanceProbeFont(...))`): a face that
 * has not arrived measures as its fallback.
 */
export function measureCharWidthRatio(
	ctx: AdvanceMeter,
	fontFamily: string,
	fontSize: number,
): number {
	const size = fontSize * BASE_VIDEO_SCALE;
	ctx.font = advanceProbeFont(fontFamily, fontSize);
	return ctx.measureText(PROBE_GLYPH).width / size;
}
