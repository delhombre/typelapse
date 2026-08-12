/**
 * The uploaded background, decoded into something a canvas can draw.
 *
 * The DOM renderers get this for free: an `image:` background becomes a
 * `url(<data URL>)` and the browser decodes it as part of laying the page out.
 * A canvas has to be handed pixels, so the same data URL is fetched and decoded
 * here — by the worker before it paints, and by the main thread before it makes
 * a still.
 *
 * A failure is loud. An export that quietly drops the user's own photograph is
 * worse than one that does not happen, because only one of the two is noticed.
 */

import { parseBackdrop } from "@/application/backgrounds/backdrop";
import type { BackdropImage } from "@/application/frame-painter/scene";

export async function decodeBackdropImage(background: string): Promise<BackdropImage | null> {
	const backdrop = parseBackdrop(background);
	if (backdrop.kind !== "image") {
		return null;
	}
	try {
		const response = await fetch(backdrop.source);
		const bitmap = await createImageBitmap(await response.blob());
		return { image: bitmap, width: bitmap.width, height: bitmap.height };
	} catch {
		throw new Error(
			"The uploaded background image could not be decoded here, so the export would come out without it.",
		);
	}
}
