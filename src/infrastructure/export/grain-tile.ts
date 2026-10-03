/**
 * The film-grain tile, drawn where an SVG can be drawn.
 *
 * The DOM renderers hand the tile's data URL to CSS and the browser rasterises
 * it. A canvas needs pixels, and Chrome's `createImageBitmap` refuses an SVG
 * blob in every scope, the worker included: the worker used to try, swallow the
 * refusal and paint every export without grain, a few levels darker than the
 * preview and the server file (ticket #108). An `<img>` is the door an SVG comes
 * through as pixels, and only the tab has one, so the tab draws the tile once
 * per export and the bitmap moves to the worker with the job.
 */

import { GRAIN_OPACITY, GRAIN_TILE_SIZE, GRAIN_TILE_URL } from "@/application/backgrounds/grain";
import type { GrainTile } from "@/application/frame-painter/scene";

export async function rasterizeGrainTile(): Promise<ImageBitmap | null> {
	try {
		const image = new Image();
		image.src = GRAIN_TILE_URL;
		await image.decode();
		return await createImageBitmap(image);
	} catch {
		// The grain is texture, not information: a frame without it is still a
		// frame, so this must never be what fails an export.
		return null;
	}
}

/**
 * The tile as the painter tiles it, at the size and opacity the CSS uses.
 *
 * A GIF goes without, as it always has: per-pixel noise is the one thing a
 * 256-colour palette and LZW cannot hold, and a one-second 1080p loop grew from
 * 0.49 MB to 3.1 MB with it, for a lift of three or four levels that the
 * palette's own quantisation already moves past.
 */
export function grainTileOf(
	bitmap: ImageBitmap | null | undefined,
	output: "mp4" | "webm" | "gif" | "png",
): GrainTile | null {
	if (!bitmap || output === "gif") {
		return null;
	}
	return { image: bitmap, size: GRAIN_TILE_SIZE, opacity: GRAIN_OPACITY };
}
