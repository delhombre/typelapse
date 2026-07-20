/**
 * Social platform safe-zone spec: pure, dependency-free.
 *
 * A "safe zone" is the slice of a video's width/height that a platform's feed UI
 * (headers, captions, action rails) draws on top of, so the creator keeps the
 * important content out of it. Every value is a FRACTION of the canvas W/H, so
 * the same numbers hold at 1080x1920, 4K, or any other resolution.
 *
 * Sources (conservative safe margins gathered from each platform's published
 * creator / ad safe-zone guidance and widely used community templates; the
 * bottom is sized for the EXPANDED caption state, the worst case for occlusion):
 *
 *   Instagram Reels  help.instagram.com + business.instagram.com Reels specs
 *                    (top name/time bar, right action rail, bottom caption+audio)
 *   TikTok           ads.tiktok.com "Creative safe zones" (bottom caption + CTA
 *                    is the largest of any platform; right action rail)
 *   YouTube Shorts   support.google.com/youtube Shorts safe area
 *                    (bottom title+channel, right action rail)
 *   X / Twitter      immersive full-screen vertical viewer, mirrors Reels
 *   LinkedIn         in-feed square / portrait card, minimal chrome
 *                    (author row on top, reactions bar on the bottom)
 *
 * Treat these as GUIDES, not pixel-exact masks: platform chrome shifts across
 * app versions and devices. When in doubt, keep code well inside the margins.
 */

export type SocialPlatform = "reels" | "tiktok" | "shorts" | "x" | "linkedin";

export type SafeZoneEdge = "top" | "bottom" | "left" | "right";

/** Occluded fraction on each edge of the canvas (0..1). */
export interface SafeZone {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

/** A single labeled region the platform UI covers, used to draw the guides. */
export interface OccludedRegion {
	edge: SafeZoneEdge;
	/** Fraction of the canvas the region spans inward from its edge. */
	fraction: number;
	/** Human label for what sits there, e.g. "caption & audio". */
	label: string;
}

interface PlatformSpec {
	readonly label: string;
	readonly safeZone: SafeZone;
	readonly regions: readonly OccludedRegion[];
}

/** Every platform in canonical order (vertical feeds first, then LinkedIn). */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = Object.freeze([
	"reels",
	"tiktok",
	"shorts",
	"x",
	"linkedin",
]);

/**
 * The spec table. Region fractions are drawn from the same safe-zone numbers,
 * so the guides can never disagree with the margins (enforced by the tests).
 */
const SPEC: Readonly<Record<SocialPlatform, PlatformSpec>> = deepFreeze({
	reels: {
		label: "Reels",
		safeZone: { top: 0.13, bottom: 0.21, left: 0.05, right: 0.12 },
		regions: [
			{ edge: "top", fraction: 0.13, label: "name & time" },
			{ edge: "right", fraction: 0.12, label: "action buttons" },
			{ edge: "bottom", fraction: 0.21, label: "caption & audio" },
		],
	},
	tiktok: {
		label: "TikTok",
		safeZone: { top: 0.07, bottom: 0.25, left: 0.04, right: 0.13 },
		regions: [
			{ edge: "right", fraction: 0.13, label: "action buttons" },
			{ edge: "bottom", fraction: 0.25, label: "caption & CTA" },
		],
	},
	shorts: {
		label: "Shorts",
		safeZone: { top: 0.12, bottom: 0.2, left: 0.05, right: 0.11 },
		regions: [
			{ edge: "right", fraction: 0.11, label: "action buttons" },
			{ edge: "bottom", fraction: 0.2, label: "title & channel" },
		],
	},
	x: {
		label: "X",
		safeZone: { top: 0.13, bottom: 0.21, left: 0.05, right: 0.12 },
		regions: [
			{ edge: "top", fraction: 0.13, label: "author & time" },
			{ edge: "right", fraction: 0.12, label: "action buttons" },
			{ edge: "bottom", fraction: 0.21, label: "post & replies" },
		],
	},
	linkedin: {
		label: "LinkedIn",
		safeZone: { top: 0.04, bottom: 0.1, left: 0.04, right: 0.04 },
		regions: [
			{ edge: "top", fraction: 0.04, label: "author" },
			{ edge: "bottom", fraction: 0.1, label: "reactions" },
		],
	},
});

/** Display labels for the platform picker. */
export const PLATFORM_LABELS: Readonly<Record<SocialPlatform, string>> = deepFreeze({
	reels: SPEC.reels.label,
	tiktok: SPEC.tiktok.label,
	shorts: SPEC.shorts.label,
	x: SPEC.x.label,
	linkedin: SPEC.linkedin.label,
});

/** Safe-zone fractions for a platform (immutable). */
export function safeZoneFor(platform: SocialPlatform): SafeZone {
	return SPEC[platform].safeZone;
}

/** Labeled regions the platform UI occludes, for the guide overlay. */
export function occludedRegions(platform: SocialPlatform): readonly OccludedRegion[] {
	return SPEC[platform].regions;
}

/** How close a measured ratio must be to a named aspect to count as a match. */
const ASPECT_TOLERANCE = 0.02;

const RATIO_9_16 = 9 / 16;
const RATIO_1_1 = 1;
const RATIO_4_5 = 4 / 5;

/**
 * The platforms whose feed uses the given canvas aspect, for auto-suggesting:
 * 9:16 -> reels / tiktok / shorts / x, 1:1 or 4:5 -> linkedin, anything else
 * (16:9, 3:4, ...) -> none. Degenerate dimensions return no platforms.
 */
export function platformsForAspect(width: number, height: number): SocialPlatform[] {
	if (width <= 0 || height <= 0) {
		return [];
	}
	const ratio = width / height;
	if (approx(ratio, RATIO_9_16)) {
		return ["reels", "tiktok", "shorts", "x"];
	}
	if (approx(ratio, RATIO_1_1) || approx(ratio, RATIO_4_5)) {
		return ["linkedin"];
	}
	return [];
}

function approx(a: number, b: number): boolean {
	return Math.abs(a - b) <= ASPECT_TOLERANCE;
}

/** Recursively freeze an object literal so the spec table is truly immutable. */
function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const key of Object.keys(value)) {
			deepFreeze((value as Record<string, unknown>)[key]);
		}
		Object.freeze(value);
	}
	return value;
}
