import {
	avcCodecStrings,
	encodingFor,
	evenDimensions,
	h264Level,
} from "@/infrastructure/export/video-encoding";
import { describe, expect, it } from "vitest";

describe("evenDimensions", () => {
	it("leaves an already-even size alone", () => {
		expect(evenDimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
	});

	it("rounds an odd axis down, because H.264 has no odd chroma plane", () => {
		expect(evenDimensions(1921, 1081)).toEqual({ width: 1920, height: 1080 });
	});

	it("never produces a canvas of zero pixels", () => {
		expect(evenDimensions(1, 1)).toEqual({ width: 2, height: 2 });
	});
});

describe("h264Level", () => {
	it("picks 3.1 for 720p at 30, the level the spike measured on", () => {
		expect(h264Level(1280, 720, 30)).toBe(31);
	});

	it("climbs to 4.2 for 1080p at 60, where 4.0 runs out of macroblocks a second", () => {
		expect(h264Level(1920, 1080, 30)).toBe(40);
		expect(h264Level(1920, 1080, 60)).toBe(42);
	});

	it("reaches 5.1 for 4K at 30 and 5.2 at 60", () => {
		expect(h264Level(3840, 2160, 30)).toBe(51);
		expect(h264Level(3840, 2160, 60)).toBe(52);
	});

	it("tops out rather than returning nothing for an absurd frame", () => {
		expect(h264Level(16384, 16384, 120)).toBe(62);
	});
});

describe("avcCodecStrings", () => {
	it("spells the level as the two hex digits the codec string wants", () => {
		expect(avcCodecStrings(1280, 720, 30)[0]).toBe("avc1.42001f");
		expect(avcCodecStrings(1920, 1080, 60)[0]).toBe("avc1.42002a");
	});

	it("offers high profile as a fallback, since baseline thins out up high", () => {
		expect(avcCodecStrings(3840, 2160, 60)).toEqual(["avc1.420034", "avc1.640034"]);
	});
});

describe("encodingFor", () => {
	it("routes mp4 through H.264", () => {
		const choice = encodingFor("mp4", 1920, 1080, 60);
		expect(choice).toMatchObject({ container: "mp4", codec: "avc", mime: "video/mp4" });
		expect(choice.probeCodecs).toContain("avc1.42002a");
	});

	it("routes webm through VP9, which needs no level arithmetic", () => {
		const choice = encodingFor("webm", 1920, 1080, 60);
		expect(choice).toMatchObject({ container: "webm", codec: "vp9", mime: "video/webm" });
		expect(choice.probeCodecs).toEqual(["vp09.00.10.08"]);
	});

	it("routes gif past WebCodecs entirely: there is no hardware GIF encoder", () => {
		const choice = encodingFor("gif", 800, 600, 30);
		expect(choice).toMatchObject({ container: "gif", codec: null, mime: "image/gif" });
		expect(choice.probeCodecs).toEqual([]);
	});
});
