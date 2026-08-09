import type { SocialPlatform } from "@/application/social/safe-zones";
import { platformsForAspect } from "@/application/social/safe-zones";
import { create } from "zustand";

/**
 * Social-preview view state: an EPHEMERAL editor overlay, deliberately kept out
 * of the snippet / export / share payload. It only decides what the preview
 * paints on top of the card, never what gets rendered or captured.
 */
interface SocialPreviewState {
	/** Whether the in-feed mockup overlay is showing. */
	enabled: boolean;
	/** The platform whose feed chrome + safe zones are drawn. */
	platform: SocialPlatform;
	/** Whether the dimmed safe-zone guide bands + labels are drawn. */
	showGuides: boolean;

	setEnabled: (enabled: boolean) => void;
	setPlatform: (platform: SocialPlatform) => void;
	setShowGuides: (showGuides: boolean) => void;
}

export const useSocialPreviewStore = create<SocialPreviewState>((set) => ({
	enabled: false,
	platform: "reels",
	showGuides: true,

	setEnabled: (enabled) => set({ enabled }),
	setPlatform: (platform) => set({ platform }),
	setShowGuides: (showGuides) => set({ showGuides }),
}));

/**
 * The platform actually shown, reconciled against the current export aspect:
 * the stored choice if it is valid for this aspect, else the first platform the
 * aspect offers, else null when the mode is off or the aspect has no feed
 * (e.g. 16:9). Pure, so the overlay is correct even before the picker writes a
 * reconciled choice back to the store.
 */
export function resolveSocialPlatform(
	enabled: boolean,
	platform: SocialPlatform,
	width: number,
	height: number,
): SocialPlatform | null {
	if (!enabled) {
		return null;
	}
	const platforms = platformsForAspect(width, height);
	if (platforms.length === 0) {
		return null;
	}
	return platforms.includes(platform) ? platform : (platforms[0] ?? null);
}
