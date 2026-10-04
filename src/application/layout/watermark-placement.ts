import { BASE_VIDEO_SCALE } from "./canvas-fit";

/**
 * The watermark's geometry as authored against the reference tier (1080p), in
 * pixels: the composition's fixed values, kept verbatim so a 1080p export is
 * unchanged to the pixel.
 */
const WATERMARK_AT_REFERENCE = { right: 56, bottom: 48, fontSize: 22 } as const;

export interface WatermarkPlacement {
	/** Inset of the text's right edge from the canvas's right edge. */
	right: number;
	/** Inset of the text's line box bottom from the canvas's bottom edge. */
	bottom: number;
	fontSize: number;
}

/**
 * Where the user's mark sits, bottom-right of the canvas, for a renderer drawing
 * at `scale` (the `renderScaleFor` factor the card takes).
 *
 * One table for the three renderers: the preview used to draw the mark under the
 * window, the composition at the canvas corner, and the painter at the corner in
 * 1080p pixels whatever the tier. Dividing by the base scale makes `scale` a
 * plain tier multiplier: 1 at 1080p, 2 at 4K.
 */
export function watermarkPlacement(scale: number): WatermarkPlacement {
	const tier = scale / BASE_VIDEO_SCALE;
	return {
		right: WATERMARK_AT_REFERENCE.right * tier,
		bottom: WATERMARK_AT_REFERENCE.bottom * tier,
		fontSize: WATERMARK_AT_REFERENCE.fontSize * tier,
	};
}
