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

/**
 * The correction the social preview needs after the canvas has changed shape.
 *
 * `null` means leave it alone. This is a decision and not an effect, so it can
 * be stated once and checked without a browser: the island applies whatever it
 * returns.
 *
 * The case that matters is the third one. When no feed uses the current shape
 * the preview cannot be wearing one, but `enabled` used to stay set — a switch
 * with no visible position and no way to reach it, since the row shows shape
 * chips in that state and offers no Off. Return to a supported shape and the
 * overlay came back on its own, a mode the visitor had left being restored by a
 * control they never touched.
 */
export function socialCorrection(args: {
	enabled: boolean;
	platform: SocialPlatform;
	platforms: readonly SocialPlatform[];
}): { disable: true } | { platform: SocialPlatform } | null {
	if (!args.enabled) {
		return null;
	}
	if (args.platforms.length === 0) {
		return { disable: true };
	}
	const first = args.platforms[0];
	if (first && !args.platforms.includes(args.platform)) {
		return { platform: first };
	}
	return null;
}

/** A feed the current shape cannot preview, and the shapes that can. */
export interface LockedFeed {
	readonly platform: SocialPlatform;
	/** The shapes that unlock it, as the row says them: "1:1 or 4:5". */
	readonly needs: string;
}

/**
 * The feeds to show greyed beside the ones the shape allows, with what unlocks
 * them. Only the cross-over is shown: on a vertical shape LinkedIn is there and
 * off, so "where did LinkedIn go" has an answer on the row; every other shape
 * either has its own feeds or none, and a row of five greyed chips would be noise.
 * Derived from the same safe-zone table as the shapes, so it cannot drift.
 */
export function lockedFeeds(platforms: readonly SocialPlatform[]): LockedFeed[] {
	if (platforms.length === 0 || platforms.includes("linkedin")) {
		return [];
	}
	const needs = FEED_ASPECTS.filter((aspect) => {
		const dims = dimensionsFor(aspect, "1080p");
		return platformsForAspect(dims.width, dims.height).includes("linkedin");
	});
	return needs.length > 0 ? [{ platform: "linkedin", needs: needs.join(" or ") }] : [];
}
