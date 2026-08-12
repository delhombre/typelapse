import {
	ASPECT_LABELS,
	type AspectLabel,
	type ResolutionTier,
	dimensionsFor,
} from "@/domain/entities/render-config";
import { type SocialPlatform, platformsForAspect } from "./safe-zones";

/**
 * The shapes a feed can be previewed in, and what one press on one of them does.
 *
 * The social row used to answer an unsupported aspect with a sentence — "Set a
 * 9:16, 1:1 or 4:5 ratio" — which named an action and then refused to perform
 * it: the control that sets the ratio is a sheet away, in Frame, and the row
 * neither took you there nor did it itself. It is the row's own instruction, so
 * it is the row's job.
 *
 * The list is DERIVED from the safe-zone spec rather than written out. The
 * sentence had the three ratios spelled into it as prose, which is a copy of a
 * table that lives somewhere else; add a feed for 3:4 to `safe-zones.ts` and
 * this grows on its own instead of going quietly out of date.
 */

/** Every named aspect whose canvas some platform's feed actually uses. */
export const FEED_ASPECTS: readonly AspectLabel[] = Object.freeze(
	ASPECT_LABELS.filter((aspect) => {
		const dims = dimensionsFor(aspect, "1080p");
		return platformsForAspect(dims.width, dims.height).length > 0;
	}),
);

/** The size to set and the feed to land on, for one press on one chip. */
export interface FeedEntry {
	width: number;
	height: number;
	platform: SocialPlatform;
}

/**
 * What a press on the chip for `aspect` has to do, at the tier the project is
 * already on: both halves of the move in one answer, or `null` for an aspect no
 * feed uses.
 *
 * The platform is the first that uses the aspect, because that is the one the
 * island's own effect keeps the store on: landing anywhere else would be
 * corrected out from under the press that chose it.
 */
export function feedEntryFor(aspect: AspectLabel, tier: ResolutionTier): FeedEntry | null {
	const dims = dimensionsFor(aspect, tier);
	const platform = platformsForAspect(dims.width, dims.height)[0];
	if (!platform) {
		return null;
	}
	return { width: dims.width, height: dims.height, platform };
}
