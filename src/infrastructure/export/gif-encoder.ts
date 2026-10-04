/**
 * GIF, by hand, because no browser has a hardware GIF encoder.
 *
 * WebCodecs gets mp4 and webm essentially for free; a GIF has to be quantised
 * to 256 colours a frame and packed into LZW by us. `gifenc` (MIT, unmodified)
 * does the packing; the decision that matters here is the palette.
 *
 * A single global palette is smaller and faster, and it is also wrong for this
 * app: the background is an animated mesh gradient, and a palette chosen from
 * one frame bands visibly as the blobs drift under it. So every frame quantises
 * its own local table. It costs size and time, and it is the difference between
 * a GIF worth shipping and one that looks broken.
 */

import type { VideoScript } from "@/application/export/video-script";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { orderedDither } from "./gif-quality";
import { gifFrameDelays } from "./gif-timing";

export interface GifEncodeInput {
	canvas: OffscreenCanvas;
	ctx: OffscreenCanvasRenderingContext2D;
	script: VideoScript;
	fps: number;
	/** Async where a frame waits on its video layers' decoded pictures. */
	paint: (frame: number) => Promise<void>;
	report: (completedFrames: number, totalFrames: number) => void;
	/** Keep the frame's alpha as the format's one transparent colour. */
	transparent: boolean;
}

export interface GifEncodeResult {
	buffer: ArrayBuffer;
	paintMs: number;
	codec: string;
}

/** Full colour depth. Fewer would be smaller, and the mesh would show it. */
const PALETTE_SIZE = 256;

/**
 * A GIF is the one format here that carries a background of `None`, and it does
 * it with a single palette entry rather than a channel. That entry has to be
 * quantised for — hence the `rgba4444` format, which keeps alpha through the
 * palette build — and it has to be found again afterwards to be named in each
 * frame's graphic control block.
 */
const OPAQUE = { format: "rgb565" } as const;
const WITH_ALPHA = { format: "rgba4444", oneBitAlpha: true, clearAlpha: true } as const;

export async function encodeGif(input: GifEncodeInput): Promise<GifEncodeResult> {
	const { canvas, ctx, script, fps, paint, report, transparent } = input;
	const encoder = GIFEncoder();
	const delays = gifFrameDelays(script.totalFrames, fps);
	const options = transparent ? WITH_ALPHA : OPAQUE;
	let paintMs = 0;

	for (let frame = 0; frame < script.totalFrames; frame++) {
		const before = performance.now();
		await paint(frame);
		paintMs += performance.now() - before;

		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
		// Dither before quantising, not after: the point is to give the quantiser
		// a spread it can straddle with two palette entries where it would
		// otherwise have to pick one and band. Alpha is left alone either way.
		const dithered = orderedDither(data, canvas.width, canvas.height);
		const palette = quantize(dithered, PALETTE_SIZE, options);
		const transparentIndex = transparent ? clearIndex(palette) : -1;
		encoder.writeFrame(
			applyPalette(dithered, palette, options.format),
			canvas.width,
			canvas.height,
			{
				palette,
				transparent: transparentIndex >= 0,
				transparentIndex: Math.max(0, transparentIndex),
				// gifenc takes milliseconds and divides; the delays are already whole
				// centisecondes, so multiplying back is lossless.
				delay: (delays[frame] ?? 0) * 10,
			},
		);
		report(frame + 1, script.totalFrames);
		// Quantising a 4K frame is long enough to starve the worker's own message
		// queue, and a progress event nobody reads is not progress. Yield.
		await Promise.resolve();
	}

	encoder.finish();
	// `bytes()` hands back a view into a pooled buffer; the transfer needs one
	// that is exactly the GIF and nothing else.
	const bytes = encoder.bytes();
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return { buffer, paintMs, codec: "gif/lzw" };
}

/**
 * The palette entry `quantize` reserved for the cleared pixels, or -1 when the
 * frame turned out to have none. A frame with no transparency in it must not
 * declare a transparent index, or it hands one of its own colours away.
 */
function clearIndex(palette: number[][]): number {
	return palette.findIndex((entry) => entry.length >= 4 && entry[3] === 0);
}
