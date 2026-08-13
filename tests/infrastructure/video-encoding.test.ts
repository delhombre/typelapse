import {
	avcCodecStrings,
	encodingFor,
	encodingQuality,
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

describe("encodingQuality", () => {
	const mbps = (bits: number) => bits / 1_000_000;

	it("asks for far more than a talking-head default at 1080p, because code is edges", () => {
		// mediabunny's own QUALITY_HIGH lands 1080p on ~6.1 Mbps, which is a
		// bitrate for faces. Thin coloured glyphs on a dark, moving gradient are
		// the worst case for a block transform, and they are the whole picture.
		const { bitrate } = encodingQuality("avc", 1920, 1080, 60);
		expect(mbps(bitrate)).toBeGreaterThan(12);
		expect(mbps(bitrate)).toBeLessThan(20);
	});

	it("charges for frame rate, which the library's formula ignores entirely", () => {
		const thirty = encodingQuality("avc", 1920, 1080, 30).bitrate;
		const sixty = encodingQuality("avc", 1920, 1080, 60).bitrate;
		// Twice the frames are not twice the bytes — consecutive frames of a code
		// animation are nearly identical — but they are not free either.
		expect(sixty).toBeGreaterThan(thirty);
		expect(sixty).toBeLessThan(thirty * 2);
	});

	it("climbs with pixels, sublinearly: a bigger frame codes cheaper per pixel", () => {
		const hd = encodingQuality("avc", 1920, 1080, 60).bitrate;
		const uhd = encodingQuality("avc", 3840, 2160, 60).bitrate;
		expect(uhd).toBeGreaterThan(hd * 2);
		expect(uhd).toBeLessThan(hd * 4);
	});

	it("puts 4K in the tens of megabits, where text at 4K actually resolves", () => {
		expect(mbps(encodingQuality("avc", 3840, 2160, 60).bitrate)).toBeGreaterThan(40);
	});

	it("spends less on VP9, which carries the same picture in fewer bits", () => {
		const avc = encodingQuality("avc", 1920, 1080, 60).bitrate;
		const vp9 = encodingQuality("vp9", 1920, 1080, 60).bitrate;
		expect(vp9).toBeLessThan(avc);
	});

	it("gives VP9 a quantizer, because that is the knob Chrome actually honours", () => {
		// Measured: VideoEncoder refuses `bitrateMode: "quantizer"` for AVC and
		// accepts it for VP9, so VP9 can be asked for a constant quality instead
		// of a budget. 28 is the measured ceiling, not an inherited default —
		// 22 bought +0.03 dB on the text for +27% bytes.
		expect(encodingQuality("vp9", 1920, 1080, 60).quantizer).toBe(28);
	});

	it("gives AVC no quantizer, so the bitrate is the one thing that governs", () => {
		expect(encodingQuality("avc", 1920, 1080, 60).quantizer).toBeNull();
	});

	it("returns whole bits per second: the encoder config takes an integer", () => {
		for (const fps of [24, 30, 60]) {
			expect(Number.isInteger(encodingQuality("avc", 1280, 720, fps).bitrate)).toBe(true);
		}
	});
});
