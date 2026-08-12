import { FEED_ASPECTS, feedEntryFor } from "@/application/social/feed-aspects";
import { platformsForAspect } from "@/application/social/safe-zones";
import { ASPECT_LABELS, RESOLUTION_TIERS, dimensionsFor } from "@/domain/entities/render-config";
import { describe, expect, it } from "vitest";

describe("the aspects a feed can be previewed in", () => {
	it("names exactly the aspects some platform's feed actually uses", () => {
		// Derived, not listed: add a feed for 3:4 in the spec table and this row
		// grows on its own rather than going quietly out of date.
		const expected = ASPECT_LABELS.filter((aspect) => {
			const dims = dimensionsFor(aspect, "1080p");
			return platformsForAspect(dims.width, dims.height).length > 0;
		});
		expect([...FEED_ASPECTS]).toEqual(expected);
	});

	it("offers 9:16, 1:1 and 4:5, and never the aspects that carry no feed", () => {
		expect([...FEED_ASPECTS]).toEqual(["1:1", "9:16", "4:5"]);
		expect(FEED_ASPECTS).not.toContain("16:9");
		expect(FEED_ASPECTS).not.toContain("3:4");
	});

	it("holds for every tier, not just the one the list was derived at", () => {
		for (const tier of RESOLUTION_TIERS) {
			for (const aspect of ASPECT_LABELS) {
				const dims = dimensionsFor(aspect, tier);
				const carriesFeed = platformsForAspect(dims.width, dims.height).length > 0;
				expect(FEED_ASPECTS.includes(aspect)).toBe(carriesFeed);
			}
		}
	});
});

describe("what one press on a feed-aspect chip has to do", () => {
	it("answers the size to set and the feed to land on, in one call", () => {
		// The dead end this replaces named an action and refused to perform it.
		// One press is one answer: both halves of the move, or neither.
		const entry = feedEntryFor("9:16", "1080p");
		expect(entry).toEqual({ width: 1080, height: 1920, platform: "reels" });
	});

	it("keeps the tier the project is already on", () => {
		expect(feedEntryFor("9:16", "4K")).toEqual({
			width: dimensionsFor("9:16", "4K").width,
			height: dimensionsFor("9:16", "4K").height,
			platform: "reels",
		});
		expect(feedEntryFor("1:1", "1440p")?.width).toBe(dimensionsFor("1:1", "1440p").width);
	});

	it("lands on the first feed that uses the aspect, which is the one the picker marks", () => {
		for (const aspect of FEED_ASPECTS) {
			for (const tier of RESOLUTION_TIERS) {
				const entry = feedEntryFor(aspect, tier);
				expect(entry).not.toBeNull();
				const platforms = platformsForAspect(entry?.width ?? 0, entry?.height ?? 0);
				// The island's own effect keeps the stored platform inside this list, so
				// a chip that landed anywhere else would be corrected out from under the
				// press that chose it.
				expect(platforms[0]).toBe(entry?.platform);
			}
		}
	});

	it("refuses an aspect no feed uses rather than guessing one", () => {
		expect(feedEntryFor("16:9", "1080p")).toBeNull();
		expect(feedEntryFor("3:4", "1080p")).toBeNull();
	});

	it("produces dimensions the preset table recognises, so the Frame chips light up too", () => {
		for (const aspect of FEED_ASPECTS) {
			const entry = feedEntryFor(aspect, "1440p");
			expect(entry).not.toBeNull();
			expect(dimensionsFor(aspect, "1440p")).toEqual({
				width: entry?.width,
				height: entry?.height,
			});
		}
	});
});
