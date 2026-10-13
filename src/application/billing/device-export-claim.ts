import { RESOLUTION_TIERS } from "../../domain/entities/render-config";

/**
 * The fastest rate the device export offers. The export panel owns the list
 * (`FPS_OPTIONS`), and importing it here would drag the whole studio into a
 * public page, so the number is stated once more and a test holds the two together.
 */
export const DEVICE_MAX_FPS = 60;

/**
 * What on-device export produces, in one clause. Alone in this file because two
 * readers need it and one of them is the route head table, which the entry
 * bundle loads: it must not pull the whole pricing view along.
 */
export function deviceIntro(): string {
	const top = RESOLUTION_TIERS.at(-1);
	return `MP4 and WebM up to ${top} at ${DEVICE_MAX_FPS} fps, and GIF and PNG from the same frame`;
}
