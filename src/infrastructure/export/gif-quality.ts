/**
 * The two concessions a GIF of this app has to make, and why.
 *
 * The background is a wide, smooth mesh gradient, and 256 colours cannot hold
 * one. Quantised straight, it comes back as concentric bands — a frame next to
 * the MP4 shows it immediately, and it is the difference between a GIF worth
 * shipping and one that looks broken. An ordered dither trades those bands for
 * a fine noise the eye reads as the gradient it came from.
 *
 * Noise, though, is exactly what LZW cannot compress: dithering roughly triples
 * the bytes. On its own that would take a 27 MB export to 80. So the frame also
 * comes down to a sane edge first. A GIF at 1080p is a category error — it is a
 * format for a loop in a README — and the two changes together land a
 * two-second export in the low megabytes with the gradient intact.
 *
 * Both are told to the user rather than done quietly.
 */

/** The long edge a GIF is brought down to. */
export const GIF_MAX_EDGE = 640;

/** How far a threshold may push a channel, in 0..255. */
const DITHER_AMPLITUDE = 16;

export interface GifDimensions {
	width: number;
	height: number;
	/** True when the frame was brought down, so the panel can say so. */
	scaled: boolean;
}

export function gifDimensions(width: number, height: number): GifDimensions {
	const longest = Math.max(width, height);
	if (longest <= GIF_MAX_EDGE) {
		return { width: even(width), height: even(height), scaled: false };
	}
	const factor = GIF_MAX_EDGE / longest;
	return {
		width: even(width * factor),
		height: even(height * factor),
		scaled: true,
	};
}

/**
 * An 8×8 Bayer matrix, built rather than typed out: the recursive
 * bit-interleave that defines it is shorter than the table and cannot be
 * mistyped.
 */
const BAYER = buildBayer();

/**
 * Nudge each channel by a threshold that depends only on the pixel's position.
 *
 * Because the offset is positional and not random, the same frame dithers the
 * same way twice — which matters here more than usual: a purely temporal noise
 * would shimmer across a video that is otherwise perfectly still between morphs.
 *
 * Alpha is left alone. A GIF's transparency is one bit, and dithering it would
 * turn a clean edge into a fringe.
 */
export function orderedDither(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): Uint8ClampedArray {
	const out = new Uint8ClampedArray(pixels);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const threshold = ((BAYER[(y & 7) * 8 + (x & 7)] ?? 0) / 64 - 0.5) * DITHER_AMPLITUDE;
			const index = (y * width + x) * 4;
			// Uint8ClampedArray clamps on assignment, which is exactly the behaviour
			// wanted at both ends of the range.
			out[index] = (pixels[index] ?? 0) + threshold;
			out[index + 1] = (pixels[index + 1] ?? 0) + threshold;
			out[index + 2] = (pixels[index + 2] ?? 0) + threshold;
		}
	}
	return out;
}

function buildBayer(): Int32Array {
	const size = 8;
	const matrix = new Int32Array(size * size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			let value = 0;
			let mask = size >> 1;
			let bit = 0;
			while (mask > 0) {
				const xBit = (x & mask) > 0 ? 1 : 0;
				const yBit = (y & mask) > 0 ? 1 : 0;
				value |= (xBit ^ yBit) << (2 * bit + 1);
				value |= yBit << (2 * bit);
				mask >>= 1;
				bit++;
			}
			matrix[y * size + x] = value;
		}
	}
	return matrix;
}

function even(value: number): number {
	const rounded = Math.round(value);
	return Math.max(2, rounded % 2 === 0 ? rounded : rounded - 1);
}
