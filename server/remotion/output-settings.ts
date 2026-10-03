/**
 * What the server hands Remotion for each output format, and why a GIF is not
 * simply "the video, in another container".
 *
 * The on-device exporter learned this the expensive way (see `gif-quality.ts`
 * and `gif-timing.ts`): a GIF of code is a 256-colour, dithered, LZW file whose
 * every frame costs nearly a whole frame's worth of bytes, so the two knobs that
 * decide whether it is worth shipping are the frame's SIZE and its RATE — and
 * the defaults that suit an MP4 get both backwards. The server was still asking
 * for whatever width and fps the request carried, which is how a 1080p 60 fps
 * "GIF" gets written: hundreds of megabytes, at a rate most decoders quietly
 * throw away.
 *
 * The three rules below are the same ones the client already follows, applied at
 * the one place the server chooses an encoder, so the two paths cannot drift:
 *
 *  1. Cap the long edge at {@link GIF_MAX_EDGE}. A GIF at 1080p is a category
 *     error; the format's job is a loop in a README.
 *  2. Cap the rate at {@link GIF_MAX_FPS}. Code is read, not watched, and the
 *     bytes a 60 fps GIF spends on motion nobody perceives buy pixels instead.
 *  3. Capture frames as PNG, not JPEG. Remotion screenshots each frame before
 *     the encoder quantises it; a JPEG intermediate bakes 4:2:0 chroma and
 *     ringing into coloured text FIRST, and the palette then preserves the
 *     artefacts faithfully. PNG is slower per frame and the only honest input to
 *     a palette. Video keeps JPEG: h264/vp8 subsample anyway, so the
 *     intermediate costs it nothing but time.
 *  4. Dither positionally, not by error diffusion — see {@link gifFilterOverride}.
 */

import { GIF_MAX_EDGE, gifDimensions } from "../../src/infrastructure/export/gif-quality";
import { GIF_MAX_FPS, gifSafeFps } from "../../src/infrastructure/export/gif-timing";

export { GIF_MAX_EDGE, GIF_MAX_FPS };

/** Output formats the render route accepts; also the ONLY strings ever put into a temp path. */
export const RENDER_FORMATS = ["mp4", "webm", "gif"] as const;
export type SafeFormat = (typeof RENDER_FORMATS)[number];

const CODECS: Record<SafeFormat, "h264" | "vp8" | "gif"> = { mp4: "h264", webm: "vp8", gif: "gif" };
const CRFS: Record<SafeFormat, number | undefined> = { mp4: 18, webm: 20, gif: undefined };
const MIME_TYPES: Record<SafeFormat, string> = {
	mp4: "video/mp4",
	webm: "video/webm",
	gif: "image/gif",
};

/** Quality of the JPEG intermediate the video formats capture each frame as. */
const JPEG_QUALITY = 95;

/**
 * The colour space every server video is encoded in. Remotion's default leaves
 * the JPEG frames full range (yuvj420p) and tags them bt470bg, so a player
 * decodes other colours than the preview. BT.709 limited range is what the
 * on-device WebCodecs exporter writes, so the three renderers agree on colour.
 */
export const SERVER_VIDEO_COLOR_SPACE = "bt709";

export interface OutputSettings {
	format: SafeFormat;
	codec: "h264" | "vp8" | "gif";
	crf: number | undefined;
	imageFormat: "jpeg" | "png";
	jpegQuality: number | undefined;
	pixelFormat: "yuv420p" | undefined;
	/** Undefined for GIF, whose palette pass Remotion always runs in BT.601. */
	colorSpace: typeof SERVER_VIDEO_COLOR_SPACE | undefined;
	mimeType: string;
	/** Encoded width, already brought inside the format's budget. */
	width: number;
	/** Encoded height, already brought inside the format's budget. */
	height: number;
	/** Encoded frame rate, already brought inside the format's budget. */
	fps: number;
	/** True when the format, not the request, decided the size or the rate. */
	downscaled: boolean;
}

/**
 * The palette filter Remotion builds for a GIF, and the one we hand ffmpeg instead.
 *
 * Remotion asks for `split[v],palettegen,[v]paletteuse`, which takes ffmpeg's
 * defaults — and the default dither is `sierra2_4a`, error diffusion. That is
 * the wrong dither for this content twice over. Error diffusion carries each
 * pixel's quantisation error into its neighbours, so an area that is *identical*
 * in two frames can come out differently in each: the code sits perfectly still
 * between morphs and the file pays to redraw it anyway, shimmering while it does
 * it. And the noise it leaves is aperiodic, which is precisely what LZW cannot
 * compress.
 *
 * A Bayer dither is positional: the same pixel always takes the same threshold,
 * so still content stays byte-identical frame to frame and the pattern repeats
 * every 8 px, which LZW eats. This is the same argument `orderedDither` makes
 * for the on-device encoder, in the encoder the server happens to use.
 *
 * Measured on the README demo, 960x540 at 20 fps: 26.2 MB with the default
 * filter, 13.4 MB with this one. Same palette size, same visible quality, half
 * the file. `bayer_scale=5` is the least visible crosshatch ffmpeg offers, which
 * is also the cheapest; over a 256-colour palette of one mesh gradient there is
 * no banding left for a noisier pattern to hide. `diff_mode=rectangle` measures
 * as free here (an animated backdrop changes every pixel anyway) and is what
 * makes a solid-colour backdrop nearly static on disk.
 *
 * Returns the args untouched when the filter is not the one we recognise, so a
 * Remotion upgrade that rewrites its own chain degrades to Remotion's defaults
 * rather than to a broken command line.
 */
const REMOTION_GIF_FILTER = "split[v],palettegen,[v]paletteuse";
const TYPELAPSE_GIF_FILTER =
	"split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle";

export function gifFilterOverride(args: readonly string[]): string[] {
	const index = args.indexOf(REMOTION_GIF_FILTER);
	if (index === -1) {
		return [...args];
	}
	const patched = [...args];
	patched[index] = TYPELAPSE_GIF_FILTER;
	return patched;
}

/**
 * Remotion's BT.709 conversion, as it builds it for `colorSpace: "bt709"`. It
 * declares the input BT.709, but the frames are JPEG screenshots, which are
 * BT.601 full range: reds drift (a #3366cc field decodes 42 instead of 49).
 * On ffmpeg 7 it also leaves primaries and transfer unknown, so the stream is
 * only half tagged. The replacement names the real input and tags all four.
 */
const REMOTION_BT709_FILTER = "zscale=matrix=709:matrixin=709:range=limited";
const TYPELAPSE_BT709_FILTER =
	"zscale=matrixin=470bg:rangein=full:primariesin=709:transferin=709:matrix=709:range=limited:primaries=709:transfer=709";

export function videoColorOverride(args: readonly string[]): string[] {
	const index = args.indexOf(REMOTION_BT709_FILTER);
	if (index === -1) {
		return [...args];
	}
	const patched = [...args];
	patched[index] = TYPELAPSE_BT709_FILTER;
	return patched;
}

/** Whitelist the format at the trust boundary; never interpolate the raw field. */
export function safeFormat(value: unknown): SafeFormat {
	return RENDER_FORMATS.includes(value as SafeFormat) ? (value as SafeFormat) : "mp4";
}

/**
 * Resolve everything the encoder needs from the format and the clamped request.
 * Pure: the route passes already-clamped numbers in and gets the numbers it must
 * actually render at back, so the composition, the temp file and the response
 * header can never disagree about what was produced.
 */
export function outputSettingsFor(
	format: SafeFormat,
	width: number,
	height: number,
	fps: number,
): OutputSettings {
	const isGif = format === "gif";
	const size = isGif ? gifDimensions(width, height) : { width, height, scaled: false };
	const rate = isGif ? gifSafeFps(fps) : fps;
	return {
		format,
		codec: CODECS[format],
		crf: CRFS[format],
		imageFormat: isGif ? "png" : "jpeg",
		jpegQuality: isGif ? undefined : JPEG_QUALITY,
		pixelFormat: isGif ? undefined : "yuv420p",
		colorSpace: isGif ? undefined : SERVER_VIDEO_COLOR_SPACE,
		mimeType: MIME_TYPES[format],
		width: size.width,
		height: size.height,
		fps: rate,
		downscaled: size.scaled || rate !== fps,
	};
}
