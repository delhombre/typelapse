import {
	av1CodecString,
	av1Level,
	avcCodecStrings,
	chooseRung,
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
		expect(avcCodecStrings(1280, 720, 30)[0]).toBe("avc1.64001f");
		expect(avcCodecStrings(1920, 1080, 60)[0]).toBe("avc1.64002a");
	});

	it("asks for high first, which is the profile every MP4 has always encoded", () => {
		// The probe used to offer baseline first and mediabunny ignored it, building
		// its own string and encoding High regardless. Now that the ladder pins what
		// it probes, the order has to be the truth or the file loses a profile.
		expect(avcCodecStrings(3840, 2160, 60)).toEqual(["avc1.640034", "avc1.420034"]);
	});
});

describe("av1Level", () => {
	it("holds 4.0 for 1080p30 and climbs to 4.1 at 60, where the display rate runs out", () => {
		// A level is a budget of samples a second, not of pixels: 1080p fits inside
		// 4.0's picture size at any rate, and blows its display rate at 60.
		expect(av1Level(1920, 1080, 30)).toBe(8);
		expect(av1Level(1920, 1080, 60)).toBe(9);
	});

	it("reaches 5.0 for 4K at 30 and 5.1 at 60", () => {
		expect(av1Level(3840, 2160, 30)).toBe(12);
		expect(av1Level(3840, 2160, 60)).toBe(13);
	});

	it("skips 2.2, 2.3, 3.2 and 3.3, which the spec reserves and never defines", () => {
		// 480p lands on 3.0, which is index 4: there is no index 2 or 3 to land on,
		// and 720p is already past 3.0's picture size and lands on 3.1.
		expect(av1Level(854, 480, 30)).toBe(4);
		expect(av1Level(1280, 720, 30)).toBe(5);
	});

	it("tops out rather than returning nothing for an absurd frame", () => {
		expect(av1Level(16384, 16384, 120)).toBe(19);
	});

	it("climbs a level when the target bitrate outgrows the one the picture alone would pick", () => {
		// 4K30 fits 5.0's picture and display rate, but the ladder asks it for
		// about 34.8 Mb/s and Main profile 5.0 grants 30. 4K60 does the same to
		// 5.1's 40 with its 52.8.
		const at30 = encodingQuality("av1", 3840, 2160, 30).bitrate;
		const at60 = encodingQuality("av1", 3840, 2160, 60).bitrate;
		expect(av1Level(3840, 2160, 30, at30, 0)).toBe(13);
		expect(av1Level(3840, 2160, 60, at60, 0)).toBe(14);
	});

	it("grants High profile twice the bits, so 4K30 4:4:4 stays on 5.0", () => {
		const at30 = encodingQuality("av1", 3840, 2160, 30).bitrate;
		expect(av1Level(3840, 2160, 30, at30, 1)).toBe(12);
	});
});

describe("av1CodecString", () => {
	it("spells the level as the two-digit seq_level_idx the string wants", () => {
		expect(av1CodecString(1, 1920, 1080, 60)).toBe("av01.1.09M.08");
		expect(av1CodecString(0, 1920, 1080, 30)).toBe("av01.0.08M.08");
	});

	it("names the level the configured bitrate needs, not only the one the frame needs", () => {
		expect(av1CodecString(0, 3840, 2160, 30)).toBe("av01.0.13M.08");
		expect(av1CodecString(0, 3840, 2160, 60)).toBe("av01.0.14M.08");
		expect(av1CodecString(1, 3840, 2160, 30)).toBe("av01.1.12M.08");
	});
});

describe("encodingFor", () => {
	it("routes mp4 through H.264 and nothing else: opening anywhere is its whole job", () => {
		const choice = encodingFor("mp4", 1920, 1080, 60);
		expect(choice).toMatchObject({ container: "mp4", mime: "video/mp4" });
		expect(choice.ladder.map((rung) => rung.codec)).toEqual(["avc", "avc"]);
		expect(choice.ladder[0]?.codecString).toBe("avc1.64002a");
	});

	it("offers WebM a ladder that starts at AV1 4:4:4, because text dies in chroma", () => {
		// Measured on a 1080p60 export of code, on a line of coloured glyphs: every
		// 4:2:0 rung lands in the same 33.6–34.0 dB band whatever the codec, because
		// they are bounded by missing chroma and not by their own compression. AV1
		// High is the only rung that leaves it, at 42.19 dB and 58% fewer bytes than
		// the MP4. So the rung that does not subsample leads.
		const choice = encodingFor("webm", 1920, 1080, 60);
		expect(choice).toMatchObject({ container: "webm", mime: "video/webm" });
		expect(choice.ladder.map((rung) => rung.label)).toEqual(["AV1 4:4:4", "AV1", "VP9", "VP8"]);
		expect(choice.ladder[0]).toMatchObject({
			codec: "av1",
			codecString: "av01.1.09M.08",
			chroma: "4:4:4",
		});
	});

	it("keeps VP9 on the string every Chrome accepts, and VP8 as the last resort", () => {
		const ladder = encodingFor("webm", 1920, 1080, 60).ladder;
		expect(ladder[2]).toMatchObject({ codec: "vp9", codecString: "vp09.00.10.08" });
		expect(ladder[3]).toMatchObject({ codec: "vp8", codecString: "vp8" });
	});

	it("subsamples every rung below the first: only AV1 High keeps whole chroma", () => {
		const ladder = encodingFor("webm", 1920, 1080, 60).ladder;
		expect(ladder.filter((rung) => rung.chroma === "4:4:4")).toHaveLength(1);
	});

	it("routes gif past WebCodecs entirely: there is no hardware GIF encoder", () => {
		const choice = encodingFor("gif", 800, 600, 30);
		expect(choice).toMatchObject({ container: "gif", mime: "image/gif" });
		expect(choice.ladder).toEqual([]);
	});
});

describe("chooseRung", () => {
	const ladder = encodingFor("webm", 1920, 1080, 60).ladder;

	it("takes the best rung the browser said yes to", () => {
		const accepted = new Set(ladder.map((rung) => rung.codecString));
		expect(chooseRung(ladder, accepted)?.label).toBe("AV1 4:4:4");
	});

	it("steps down one rung at a time as the browser refuses the ones above", () => {
		expect(chooseRung(ladder, new Set(["av01.0.09M.08", "vp09.00.10.08", "vp8"]))?.label).toBe(
			"AV1",
		);
		expect(chooseRung(ladder, new Set(["vp09.00.10.08", "vp8"]))?.label).toBe("VP9");
		expect(chooseRung(ladder, new Set(["vp8"]))?.label).toBe("VP8");
	});

	it("returns nothing rather than guessing when the browser refused every rung", () => {
		expect(chooseRung(ladder, new Set())).toBeNull();
	});

	it("ignores a yes for a codec string that is not on this ladder", () => {
		expect(chooseRung(ladder, new Set(["avc1.64002a"]))).toBeNull();
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

	it("refuses to discount AV1 for its own efficiency, which was measured", () => {
		// The obvious move — half the budget for twice the codec — buys nothing
		// here. Measured on a 1080p60 export of code: half the ask gave 1.33 MB at
		// 40.78 dB on a line of glyphs, the whole ask 1.35 MB at 41.35 dB. The
		// encoder is quality-bound long before it is rate-bound, so the discount
		// never became bytes saved; it only lowered what the allocator aimed at.
		const avc = encodingQuality("avc", 1920, 1080, 60).bitrate;
		expect(encodingQuality("av1", 1920, 1080, 60).bitrate).toBe(avc);
	});

	it("gives AV1 a quantizer on its own 0–255 scale, swept and not inherited", () => {
		// 40 is the knee: 24 triples the file for two more decibels and comes out
		// larger than the MP4, 60 starts giving the glyph edges back two at a rung.
		expect(encodingQuality("av1", 1920, 1080, 60).quantizer).toBe(40);
	});

	it("gives VP8 no quantizer: Chrome will not honour one, so offering it would lie", () => {
		expect(encodingQuality("vp8", 1920, 1080, 60).quantizer).toBeNull();
	});

	it("spends more than H.264 on VP8, the one rung that is worse than the baseline", () => {
		const avc = encodingQuality("avc", 1920, 1080, 60).bitrate;
		expect(encodingQuality("vp8", 1920, 1080, 60).bitrate).toBeGreaterThan(avc);
	});

	it("returns whole bits per second: the encoder config takes an integer", () => {
		for (const fps of [24, 30, 60]) {
			expect(Number.isInteger(encodingQuality("avc", 1280, 720, fps).bitrate)).toBe(true);
		}
	});
});
