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
	paint: (frame: number) => void;
	report: (completedFrames: number, totalFrames: number) => void;
}

export interface GifEncodeResult {
	buffer: ArrayBuffer;
	paintMs: number;
	codec: string;
}

/** Full colour depth. Fewer would be smaller, and the mesh would show it. */
const PALETTE_SIZE = 256;

export async function encodeGif(input: GifEncodeInput): Promise<GifEncodeResult> {
	const { canvas, ctx, script, fps, paint, report } = input;
	const encoder = GIFEncoder();
	const delays = gifFrameDelays(script.totalFrames, fps);
	let paintMs = 0;

	for (let frame = 0; frame < script.totalFrames; frame++) {
		const before = performance.now();
		paint(frame);
		paintMs += performance.now() - before;

		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
		// Dither before quantising, not after: the point is to give the quantiser
		// a spread it can straddle with two palette entries where it would
		// otherwise have to pick one and band.
		const dithered = orderedDither(data, canvas.width, canvas.height);
		const palette = quantize(dithered, PALETTE_SIZE);
		encoder.writeFrame(applyPalette(dithered, palette), canvas.width, canvas.height, {
			palette,
			// gifenc takes milliseconds and divides; the delays are already whole
			// centisecondes, so multiplying back is lossless.
			delay: (delays[frame] ?? 0) * 10,
		});
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
