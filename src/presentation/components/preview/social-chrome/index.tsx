import type { SafeZone, SocialPlatform } from "@/application/social/safe-zones";
import { safeZoneFor } from "@/application/social/safe-zones";
import { LinkedInChrome } from "./linkedin-chrome";
import { ReelsChrome } from "./reels-chrome";
import { ShortsChrome } from "./shorts-chrome";
import { TikTokChrome } from "./tiktok-chrome";
import { XChrome } from "./x-chrome";

/**
 * High-fidelity, preview-only recreation of each platform's in-feed chrome, so
 * a creator can see their export the way it lands in a real feed.
 *
 * Licensing / trademark note: the one brand wordmark still shown (YouTube
 * Shorts) is drawn from `simple-icons`, which is released under CC0-1.0; the
 * other feeds are identified by their recreated UI alone. All of it is used
 * nominatively to identify each platform for a creator preview aid ONLY:
 * Typelapse is not affiliated with,
 * sponsored by, or endorsed by any of these platforms. Nothing here is captured
 * by the PNG snapshot or baked into the exported video.
 */
export function SocialChrome({ platform }: { platform: SocialPlatform }) {
	const zone = safeZoneFor(platform);
	return <div style={{ position: "absolute", inset: 0 }}>{chromeFor(platform, zone)}</div>;
}

function chromeFor(platform: SocialPlatform, zone: SafeZone) {
	switch (platform) {
		case "tiktok":
			return <TikTokChrome zone={zone} />;
		case "reels":
			return <ReelsChrome zone={zone} />;
		case "shorts":
			return <ShortsChrome zone={zone} />;
		case "x":
			return <XChrome zone={zone} />;
		case "linkedin":
			return <LinkedInChrome zone={zone} />;
		default:
			return null;
	}
}
