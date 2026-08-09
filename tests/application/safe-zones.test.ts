import {
	PLATFORM_LABELS,
	SOCIAL_PLATFORMS,
	type SocialPlatform,
	occludedRegions,
	platformsForAspect,
	safeZoneFor,
} from "@/application/social/safe-zones";
import { describe, expect, it } from "vitest";

describe("safeZoneFor", () => {
	it.each(SOCIAL_PLATFORMS)("keeps every %s fraction within [0, 1]", (platform) => {
		const zone = safeZoneFor(platform);
		for (const value of [zone.top, zone.bottom, zone.left, zone.right]) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});

	it.each(SOCIAL_PLATFORMS)(
		"leaves %s a usable band (opposite edges never fill the frame)",
		(platform) => {
			const zone = safeZoneFor(platform);
			expect(zone.top + zone.bottom).toBeLessThan(1);
			expect(zone.left + zone.right).toBeLessThan(1);
		},
	);
});

describe("occludedRegions", () => {
	it.each(SOCIAL_PLATFORMS)("returns non-empty, labeled regions for %s", (platform) => {
		const regions = occludedRegions(platform);
		expect(regions.length).toBeGreaterThan(0);
		for (const region of regions) {
			expect(region.label.trim().length).toBeGreaterThan(0);
			expect(["top", "bottom", "left", "right"]).toContain(region.edge);
			expect(region.fraction).toBeGreaterThan(0);
			expect(region.fraction).toBeLessThanOrEqual(1);
		}
	});

	it("draws every region fraction straight from that platform's safe zone", () => {
		for (const platform of SOCIAL_PLATFORMS) {
			const zone = safeZoneFor(platform);
			for (const region of occludedRegions(platform)) {
				expect(region.fraction).toBe(zone[region.edge]);
			}
		}
	});
});

describe("platformsForAspect", () => {
	it("maps 9:16 (1080x1920) to the vertical feeds", () => {
		expect(platformsForAspect(1080, 1920)).toEqual(["reels", "tiktok", "shorts", "x"]);
	});

	it("maps 1:1 (1080x1080) to LinkedIn", () => {
		expect(platformsForAspect(1080, 1080)).toEqual(["linkedin"]);
	});

	it("maps 4:5 (1080x1350) to LinkedIn", () => {
		expect(platformsForAspect(1080, 1350)).toEqual(["linkedin"]);
	});

	it("maps 16:9 (1920x1080) to no platform", () => {
		expect(platformsForAspect(1920, 1080)).toEqual([]);
	});

	it("returns nothing for degenerate dimensions", () => {
		expect(platformsForAspect(0, 0)).toEqual([]);
		expect(platformsForAspect(-1080, 1920)).toEqual([]);
	});
});

describe("PLATFORM_LABELS", () => {
	it("gives every platform a display label", () => {
		const expected: Record<SocialPlatform, string> = {
			reels: "Reels",
			tiktok: "TikTok",
			shorts: "Shorts",
			x: "X",
			linkedin: "LinkedIn",
		};
		expect(PLATFORM_LABELS).toEqual(expected);
	});
});
