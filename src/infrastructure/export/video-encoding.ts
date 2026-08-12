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

export type ClientCodec = "avc" | "vp9";

export interface EncodingChoice {
	container: "mp4" | "webm" | "gif";
	/** mediabunny's codec name, or null when the format never touches WebCodecs. */
	codec: ClientCodec | null;
	mime: string;
	/** Codec strings to offer `VideoEncoder.isConfigSupported`, best first. */
	probeCodecs: string[];
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
 * Baseline first, then high. Baseline is the most widely implemented profile
 * and the safest thing to ask for; above 1080p, though, it is also the one
 * hardware encoders are likeliest to have dropped, so high follows it.
 */
export function avcCodecStrings(width: number, height: number, fps: number): string[] {
	const level = h264Level(width, height, fps).toString(16).padStart(2, "0");
	return [`avc1.4200${level}`, `avc1.6400${level}`];
}

export function encodingFor(
	format: RenderFormat,
	width: number,
	height: number,
	fps: number,
): EncodingChoice {
	if (format === "webm") {
		// VP9 profile 0, level 1.0, 8-bit. VP9's levels are advisory where H.264's
		// are contractual, and every Chrome that has VP9 accepts this string.
		return {
			container: "webm",
			codec: "vp9",
			mime: "video/webm",
			probeCodecs: ["vp09.00.10.08"],
		};
	}
	if (format === "gif") {
		return { container: "gif", codec: null, mime: "image/gif", probeCodecs: [] };
	}
	return {
		container: "mp4",
		codec: "avc",
		mime: "video/mp4",
		probeCodecs: avcCodecStrings(width, height, fps),
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
