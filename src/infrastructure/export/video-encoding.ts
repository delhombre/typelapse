/**
 * What to ask the browser's encoder for, given a format and a frame size.
 *
 * WebCodecs will not tell you "close enough": a codec string names a profile
 * *and* a level, and a level is a budget of macroblocks per second. The spike
 * hard-coded `avc1.42001f` because it only ever rendered 720p at 30; a real
 * export runs 4K at 60, where that string is refused outright. So the level is
 * computed from the frame the user actually asked for, out of Annex A of the
 * spec, and the whole decision is kept pure so it can be checked without a
 * browser in the room.
 */

import type { RenderFormat } from "@/domain/entities/render-config";

export type ClientCodec = "avc" | "av1" | "vp9" | "vp8";

/**
 * One step of a container's codec ladder.
 *
 * A ladder is data, not a branch: the rungs are written down in the order they
 * should be tried, the browser is asked about each in turn, and the first yes
 * wins. The codec string is pinned rather than left to the muxer, because a
 * generic yes is not the yes we need — `av1` supported says nothing about
 * whether *High profile* is, and High profile is the entire reason to ask.
 */
export interface CodecRung {
	/** mediabunny's codec name: what the muxer and the probe both take. */
	codec: ClientCodec;
	/** The exact WebCodecs string this rung encodes with, profile and level included. */
	codecString: string;
	/** What the export's outcome note calls this rung. */
	label: string;
	/** What the file's chroma planes will actually be. */
	chroma: "4:4:4" | "4:2:0";
}

export interface EncodingChoice {
	container: "mp4" | "webm" | "gif";
	mime: string;
	/** The rungs to try, best first. Empty when the format never touches WebCodecs. */
	ladder: readonly CodecRung[];
}

/**
 * H.264 level limits: macroblocks per second, then macroblocks per frame.
 * Straight out of the spec's Table A-1, in the order a level should be tried.
 */
const H264_LEVELS: readonly [level: number, maxMbps: number, maxFs: number][] = [
	[30, 40500, 1620],
	[31, 108000, 3600],
	[32, 216000, 5120],
	[40, 245760, 8192],
	[42, 522240, 8704],
	[50, 589824, 22080],
	[51, 983040, 36864],
	[52, 2073600, 36864],
	[60, 4177920, 139264],
	[61, 8355840, 139264],
	[62, 16711680, 139264],
];

/**
 * The lowest H.264 level that can carry this frame at this rate.
 *
 * Asking for more than you need is not free — some hardware encoders refuse a
 * level they cannot sustain — and asking for less is refused outright.
 */
export function h264Level(width: number, height: number, fps: number): number {
	const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
	const perSecond = macroblocks * fps;
	for (const [level, maxMbps, maxFs] of H264_LEVELS) {
		if (macroblocks <= maxFs && perSecond <= maxMbps) {
			return level;
		}
	}
	// Past 6.2 there is no level left to ask for; let the encoder be the one to
	// say no, with its own message, rather than inventing a refusal here.
	return 62;
}

/**
 * High first, then baseline.
 *
 * This order is not a change of mind, it is the order that keeps the MP4 what it
 * already was. The probe used to offer baseline first and mediabunny ignored the
 * answer — it built its own codec string and had been encoding High all along,
 * which is what PR #52 found when it made the export report the config it was
 * actually handed. Now that the ladder pins the string it probes with, the probe
 * finally decides, and the profile it decides on has to be the one every MP4 has
 * shipped with, or the file would quietly lose a profile the day the pin landed.
 *
 * High is also simply the right ask for this picture: baseline has no 8×8
 * transform and no CABAC, and both of those are worth real dB on hard edges.
 * Baseline stays underneath for a build that has somehow dropped High.
 */
export function avcCodecStrings(width: number, height: number, fps: number): string[] {
	const level = h264Level(width, height, fps).toString(16).padStart(2, "0");
	return [`avc1.6400${level}`, `avc1.4200${level}`];
}

/**
 * AV1's Annex A levels: picture size, then the two axes, then samples a second.
 *
 * The index is what goes in the codec string — `av01.1.09M.08` asks for level
 * 4.1 — and the indices are not contiguous: the spec reserves 2, 3, 6 and 7 and
 * has never defined them, so a table that counts upward would name levels that
 * do not exist.
 *
 * mediabunny has a table of its own, and it is missing the term that matters:
 * it picks a level from picture size and bitrate alone, with no frame rate in
 * it, so 1080p60 comes out labelled 4.0 — a level whose display rate 1080p60
 * exceeds by 76%. Chrome's software encoder does not enforce it and a lenient
 * decoder will play it anyway, but the file would be lying about itself. This
 * one charges for the rate, the way `h264Level` above does.
 */
const AV1_LEVELS: readonly [
	index: number,
	maxPicSize: number,
	maxWidth: number,
	maxHeight: number,
	maxDisplayRate: number,
][] = [
	[0, 147456, 2048, 1152, 4_423_680], // 2.0
	[1, 278784, 2816, 1584, 8_363_520], // 2.1
	[4, 665856, 4352, 2448, 19_975_680], // 3.0
	[5, 1065024, 5504, 3096, 31_950_720], // 3.1
	[8, 2359296, 6144, 3456, 70_778_880], // 4.0
	[9, 2359296, 6144, 3456, 141_557_760], // 4.1
	[12, 8912896, 8192, 4352, 267_386_880], // 5.0
	[13, 8912896, 8192, 4352, 534_773_760], // 5.1
	[14, 8912896, 8192, 4352, 1_069_547_520], // 5.2
	[15, 35651584, 16384, 8704, 1_069_547_520], // 5.3
	[16, 35651584, 16384, 8704, 1_069_547_520], // 6.0
	[17, 35651584, 16384, 8704, 2_139_095_040], // 6.1
	[18, 35651584, 16384, 8704, 4_278_190_080], // 6.2
	[19, 35651584, 16384, 8704, 4_278_190_080], // 6.3
];

/** The lowest AV1 level index that can carry this frame at this rate. */
export function av1Level(width: number, height: number, fps: number): number {
	const displayRate = width * height * fps;
	for (const [index, maxPicSize, maxWidth, maxHeight, maxDisplayRate] of AV1_LEVELS) {
		if (
			width * height <= maxPicSize &&
			width <= maxWidth &&
			height <= maxHeight &&
			displayRate <= maxDisplayRate
		) {
			return index;
		}
	}
	// Past 6.3 there is no level left to ask for; let the encoder be the one to
	// say no, with its own message, rather than inventing a refusal here.
	return 19;
}

/**
 * An AV1 codec string: profile, level index, tier, bit depth.
 *
 * Profile 0 is Main, which is 4:2:0 like everything else here. Profile 1 is
 * High, and High is the only profile in this file that keeps 4:4:4 chroma —
 * which is the only thing that ever mattered for a picture made of thin
 * coloured glyphs. Main tier throughout: High tier is for bitrates an order of
 * magnitude above anything a code animation asks for.
 */
export function av1CodecString(profile: 0 | 1, width: number, height: number, fps: number): string {
	const level = av1Level(width, height, fps).toString().padStart(2, "0");
	return `av01.${profile}.${level}M.08`;
}

export function encodingFor(
	format: RenderFormat,
	width: number,
	height: number,
	fps: number,
): EncodingChoice {
	if (format === "webm") {
		return { container: "webm", mime: "video/webm", ladder: webmLadder(width, height, fps) };
	}
	if (format === "gif") {
		return { container: "gif", mime: "image/gif", ladder: [] };
	}
	return {
		container: "mp4",
		mime: "video/mp4",
		// MP4's job is to open anywhere, on anything, for the next decade. That is
		// H.264's job description and nothing else's, so this ladder has one codec
		// on it and only chooses a profile.
		ladder: avcCodecStrings(width, height, fps).map((codecString) => ({
			codec: "avc" as const,
			codecString,
			label: "H.264",
			chroma: "4:2:0" as const,
		})),
	};
}

/**
 * What WebM should be encoded with, best first.
 *
 * WebM is already the modern option — Safari barely plays it at all — so it is
 * the container that can afford to ask for the better codec, and the ladder is
 * ordered by what the picture is made of rather than by what is oldest.
 *
 * **AV1 High profile** leads because it is the only rung that does not subsample
 * chroma, and chroma subsampling is where a code video actually dies: thin
 * saturated glyphs on a dark ground are the worst case there is for 4:2:0.
 *
 * The measurement makes that unusually plain. On a 1080p60 export of code,
 * scored against the painter's own lossless frames on one dense line of coloured
 * glyphs, every 4:2:0 rung lands in the same narrow band whatever the codec —
 * H.264 33.60 dB, AV1 Main 33.61, VP9 33.85, VP8 34.04 — because they are all
 * bounded by the same missing chroma samples rather than by their own
 * compression. AV1 High is the only thing on the list that leaves the band, at
 * **42.19 dB**, and it does it while spending 1.58 MB against VP9's 2.67 and
 * H.264's 3.76. Per plane on that line: 50.2 dB of chroma, against 38.8 for
 * every rung below it.
 *
 * **AV1 Main** follows for the machines that have an AV1 encoder but only at
 * Profile 0 — roughly one in ten of the ones that have AV1 at all. It is worth
 * no more than VP9 on this content, and it is above VP9 only because it gets
 * there in half the bytes.
 *
 * **VP9** is the safety net, on the settings that were measured rather than
 * inherited, and **VP8** is the last resort: strictly worse than H.264, and
 * still better than telling somebody their browser cannot make a WebM.
 */
function webmLadder(width: number, height: number, fps: number): readonly CodecRung[] {
	return [
		{
			codec: "av1",
			codecString: av1CodecString(1, width, height, fps),
			label: "AV1 4:4:4",
			chroma: "4:4:4",
		},
		{
			codec: "av1",
			codecString: av1CodecString(0, width, height, fps),
			label: "AV1",
			chroma: "4:2:0",
		},
		{
			// VP9 profile 0, level 1.0, 8-bit. VP9's levels are advisory where H.264's
			// are contractual, and every Chrome that has VP9 accepts this string.
			codec: "vp9",
			codecString: "vp09.00.10.08",
			label: "VP9",
			chroma: "4:2:0",
		},
		{ codec: "vp8", codecString: "vp8", label: "VP8", chroma: "4:2:0" },
	];
}

/**
 * The best rung the browser agreed to, or nothing.
 *
 * Pure on purpose: the answers come from outside, so the ordering — the part
 * that is a decision rather than a fact about the machine — can be checked
 * without a browser in the room. A yes for a string that is not on this ladder
 * is not an answer to the question that was asked, and is ignored.
 */
export function chooseRung(
	ladder: readonly CodecRung[],
	accepted: ReadonlySet<string>,
): CodecRung | null {
	return ladder.find((rung) => accepted.has(rung.codecString)) ?? null;
}

/**
 * What to spend on a frame of *code*.
 *
 * mediabunny's quality levels are a curve fitted to ordinary video, and they
 * land 1080p on about 6 Mbps whatever the frame rate. That is a bitrate for
 * faces. Our picture is the opposite of a face: thin, saturated glyphs with
 * hard edges, held still and then moved all at once, over a mesh gradient that
 * never stops flowing — high-frequency detail everywhere, and no flat region
 * for a block transform to buy its bits back from. Measured against the
 * painter's own output, the default lost 4.6 dB to compression on a 1080p60
 * export, and lost it *on the glyph edges*, which is the only place anybody
 * looks. So the ladder is ours, and it is deliberately generous.
 *
 * Two terms the library's formula does not have:
 *
 * - **Frame rate.** Twice the frames genuinely cost more, and the default
 *   charges nothing for them, so a 60 fps export was quietly getting half the
 *   bits per frame of a 30 fps one.
 * - **Content.** The reference below is what 1080p30 of code wants, not what
 *   1080p30 of anything wants.
 *
 * Both exponents are below one because neither term is linear: a bigger frame
 * codes cheaper per pixel, and consecutive frames of a code animation are
 * nearly identical.
 */
export interface EncodingQuality {
	/** Target bitrate, in bits per second. */
	bitrate: number;
	/**
	 * Constant-quality index, where the codec has one and the browser honours
	 * it; null when the bitrate is the only thing that governs.
	 */
	quantizer: number | null;
}

/** Bits per second for 1080p30 of code. The anchor the rest of the ladder hangs off. */
const REFERENCE_BITRATE = 10_000_000;
const REFERENCE_PIXELS = 1920 * 1080;
const REFERENCE_FPS = 30;

/** A bigger frame codes cheaper per pixel. */
const PIXEL_EXPONENT = 0.9;
/** Consecutive frames of a code animation are nearly identical. */
const FPS_EXPONENT = 0.6;

/**
 * How many bits each codec needs for the same picture, relative to H.264.
 *
 * AV1 is asked for **exactly as much as H.264**, which is not what a codec
 * comparison chart would say, and is what the measurement says.
 *
 * The obvious move is to hand AV1 half the budget, since it is worth about twice
 * as much per bit. Measured on a 1080p60 export of code, that discount buys
 * nothing and costs a little: half the ask gave 1.33 MB at 40.78 dB on a line of
 * coloured glyphs, the whole ask gave 1.35 MB at 41.35 dB. Twenty kilobytes
 * apart, half a decibel better. Chrome's AV1 encoder never spends anything like
 * the budget on this content in either case — it is quality-bound long before it
 * is rate-bound — so the discount never turned into bytes saved, it only lowered
 * the target the rate allocator was aiming at.
 *
 * Which is the general shape of this whole table: what the number buys is
 * headroom, and the size win is banked by the codec rather than by the ask. Same
 * request as H.264; a third of the file.
 *
 * (The bitrate is only AV1's fallback anyway — the quantizer below is what it
 * normally encodes on. It still has to be right, because a build that refuses
 * quantizer mode falls back to exactly this number.)
 *
 * VP8 is the only rung that costs *more* than the baseline. It is a last resort
 * and it is priced like one.
 */
const CODEC_EFFICIENCY: Record<ClientCodec, number> = {
	avc: 1,
	av1: 1,
	vp9: 0.7,
	vp8: 1.4,
};

/**
 * VP9's quantizer, on its 0–63 scale, stated rather than inherited.
 *
 * `VideoEncoder.isConfigSupported` refuses `bitrateMode: "quantizer"` for AVC
 * and accepts it for VP9, so WebM is the one format here that can be asked for
 * a constant quality instead of a budget — which is what a video of long still
 * holds and short violent morphs actually wants.
 *
 * 28 is where mediabunny's own "high" lands, and it is kept because it was
 * *measured* rather than because it was the default: 22 was tried and bought
 * +0.03 dB on the text for +27% bytes. Chrome's VP9 encoder is already at its
 * practical ceiling for this content, so a finer quantiser only buys file size.
 * The number is written down so the next person does not have to run the
 * experiment again to find out that it was chosen.
 */
const VP9_QUANTIZER = 28;

/**
 * AV1's quantizer, on the 0–255 scale AV1 uses rather than VP9's 0–63.
 *
 * This is the knob that made the top rung worth having, and it was found by
 * sweeping it. On a 1080p60 export of code, measured against the painter's own
 * lossless frame in RGB — the space a viewer actually sees, not the subsampled
 * one the file is stored in, which flatters 4:2:0 by comparing it to a reference
 * it has already damaged the same way:
 *
 * | quantizer | file    | whole frame | line of glyphs |
 * |----------:|--------:|------------:|---------------:|
 * |        24 | 4.76 MB |    46.67 dB |       44.75 dB |
 * |    **40** | 1.58 MB |    46.00 dB |       42.19 dB |
 * |        60 | 0.76 MB |    45.18 dB |       40.01 dB |
 * |        80 | 0.39 MB |    44.22 dB |       38.17 dB |
 * |       110 | 0.28 MB |    42.33 dB |       35.20 dB |
 *
 * 40 is the knee. Below it the file triples for two more decibels and comes out
 * *larger than the MP4*, which gives away the second half of the point; above
 * it the glyph edges go, two decibels a rung. For scale, the VP9 rung this
 * replaces spends 2.67 MB to reach 33.85 dB on the same line.
 *
 * A constant quality is also the right shape for this video specifically. It is
 * long still holds and short violent morphs, and a bitrate spends evenly over
 * time; a quantizer spends where the picture is actually hard.
 */
const AV1_QUANTIZER = 40;

/** Which rungs can be asked for a constant quality, and at what. */
const QUANTIZERS: Record<ClientCodec, number | null> = {
	avc: null,
	av1: AV1_QUANTIZER,
	vp9: VP9_QUANTIZER,
	vp8: null,
};

export function encodingQuality(
	codec: ClientCodec,
	width: number,
	height: number,
	fps: number,
): EncodingQuality {
	const pixelFactor = (width * height) / REFERENCE_PIXELS;
	const fpsFactor = fps / REFERENCE_FPS;
	const bitrate =
		REFERENCE_BITRATE *
		pixelFactor ** PIXEL_EXPONENT *
		fpsFactor ** FPS_EXPONENT *
		CODEC_EFFICIENCY[codec];
	return {
		// Whole kilobits: the number goes straight into a `VideoEncoderConfig`,
		// which wants an integer, and the extra precision means nothing.
		bitrate: Math.round(bitrate / 1000) * 1000,
		// AVC and VP8 get none on purpose: Chrome will not honour a quantizer for
		// either, and offering one that silently falls back would make the ladder a
		// fiction. The two that will honour one are asked for a constant quality
		// instead of a budget, which is what a video of long still holds and short
		// violent morphs actually wants.
		quantizer: QUANTIZERS[codec],
	};
}

/**
 * An even canvas on both axes.
 *
 * 4:2:0 chroma is subsampled by two, so an odd dimension has half a chroma
 * sample in it and encoders reject the configuration. Rounding down keeps the
 * frame inside whatever the user asked for; the floor of two keeps a degenerate
 * request from producing a canvas with no pixels at all.
 */
export function evenDimensions(width: number, height: number): { width: number; height: number } {
	return { width: makeEven(width), height: makeEven(height) };
}

function makeEven(value: number): number {
	const floored = Math.floor(value);
	return Math.max(2, floored % 2 === 0 ? floored : floored - 1);
}
