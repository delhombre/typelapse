import {
	exportCodecNote,
	exportCtaDetail,
	exportCtaLabel,
} from "@/application/export/export-label";
import { describe, expect, it } from "vitest";

describe("the export CTA's label", () => {
	it("carries the format and the size, so the one filled shape says what it makes", () => {
		expect(exportCtaLabel({ format: "mp4", width: 1920, height: 1080 })).toBe(
			"Export · MP4 · 1080p",
		);
	});

	it("names each format the way the format names itself", () => {
		expect(exportCtaLabel({ format: "webm", width: 1920, height: 1080 })).toBe(
			"Export · WebM · 1080p",
		);
		expect(exportCtaLabel({ format: "gif", width: 1920, height: 1080 })).toBe(
			"Export · GIF · 1080p",
		);
	});

	it("follows the size up its tiers", () => {
		expect(exportCtaLabel({ format: "mp4", width: 2560, height: 1440 })).toBe(
			"Export · MP4 · 1440p",
		);
		expect(exportCtaLabel({ format: "mp4", width: 3840, height: 2160 })).toBe("Export · MP4 · 4K");
	});

	it("reads the tier off a vertical size as readily as a wide one", () => {
		expect(exportCtaLabel({ format: "mp4", width: 1080, height: 1920 })).toBe(
			"Export · MP4 · 1080p",
		);
	});

	it("says nothing it cannot vouch for when the size matches no tier", () => {
		// A plan-clamped export or a hand-edited link: quoting a tier that is not
		// what will be rendered is worse than quoting none.
		expect(exportCtaLabel({ format: "mp4", width: 1234, height: 567 })).toBe("Export · MP4");
	});

	it("says the same thing without the verb, for the half a narrow row drops", () => {
		expect(exportCtaDetail({ format: "mp4", width: 1920, height: 1080 })).toBe("MP4 · 1080p");
		expect(exportCtaDetail({ format: "gif", width: 1234, height: 567 })).toBe("GIF");
	});
});

describe("exportCodecNote", () => {
	it("names the rung WebM actually landed on, so a fallback is visible", () => {
		expect(exportCodecNote("webm", "AV1 4:4:4")).toBe("WebM · AV1 4:4:4");
		expect(exportCodecNote("webm", "VP9")).toBe("WebM · VP9");
		expect(exportCodecNote("webm", "VP8")).toBe("WebM · VP8");
	});

	it("says nothing about MP4, whose codec was never in question", () => {
		// MP4 is H.264 by contract — universal playback is the entire job — so the
		// word would take up room in the note and tell nobody anything.
		expect(exportCodecNote("mp4", "H.264")).toBeNull();
	});

	it("says nothing about a GIF, which no codec touched", () => {
		expect(exportCodecNote("gif", null)).toBeNull();
	});
});
