/**
 * `gifenc` ships no types. Rather than `declare module "gifenc"` — which would
 * make every call site `any` and hide a signature change behind a green build —
 * this describes exactly the three functions the GIF encoder uses.
 */
declare module "gifenc" {
	/** A flat RGB palette: one `[r, g, b]` triple per index, up to 256 of them. */
	export type GifPalette = number[][];

	export interface GifWriteFrameOptions {
		palette?: GifPalette;
		/** Frame delay in milliseconds; the writer divides it into centisecondes. */
		delay?: number;
		transparent?: boolean;
		transparentIndex?: number;
		first?: boolean;
	}

	export interface GifWriter {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			options?: GifWriteFrameOptions,
		): void;
		finish(): void;
		bytes(): Uint8Array;
		reset(): void;
	}

	export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifWriter;

	/** Choose up to `maxColors` representative colours from RGBA pixel data. */
	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean },
	): GifPalette;

	/** Map RGBA pixel data onto a palette, yielding one index per pixel. */
	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: GifPalette,
		format?: "rgb565" | "rgb444" | "rgba4444",
	): Uint8Array;
}
