/**
 * The slice of a 2D drawing context the frame painter is allowed to touch.
 *
 * The painter lives in the application layer, so it must not import the DOM:
 * this is the port, and a real `CanvasRenderingContext2D` (or an
 * `OffscreenCanvasRenderingContext2D`) satisfies it structurally. A test double
 * satisfies it too, which is the only way to assert paint *order* without a
 * rasteriser.
 */

export interface PaintGradient {
	addColorStop(offset: number, color: string): void;
}

/** A repeating fill built from a decoded image (the grain tile). */
export interface PaintPattern {
	setTransform?: (...args: never[]) => void;
}

/** A decoded image the context can tile or draw (an `ImageBitmap`). */
export type PaintImage = object;

export type PaintStyle = string | PaintGradient | PaintPattern;

export interface PaintContext {
	fillStyle: PaintStyle;
	globalAlpha: number;
	globalCompositeOperation: string;
	font: string;
	textAlign: string;
	textBaseline: string;

	save(): void;
	restore(): void;
	translate(x: number, y: number): void;
	scale(x: number, y: number): void;

	beginPath(): void;
	rect(x: number, y: number, w: number, h: number): void;
	roundRect(x: number, y: number, w: number, h: number, radii?: number): void;
	arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
	fill(): void;
	clip(): void;
	fillRect(x: number, y: number, w: number, h: number): void;
	/**
	 * Erase back to nothing.
	 *
	 * Not the same as filling with a transparent colour: `source-over` composites
	 * that to a no-op, so a canvas that keeps its alpha would show the previous
	 * frame straight through a background of `None`.
	 */
	clearRect(x: number, y: number, w: number, h: number): void;
	fillText(text: string, x: number, y: number): void;
	measureText(text: string): { width: number };
	drawImage(image: PaintImage, dx: number, dy: number, dw: number, dh: number): void;

	createLinearGradient(x0: number, y0: number, x1: number, y1: number): PaintGradient;
	createRadialGradient(
		x0: number,
		y0: number,
		r0: number,
		x1: number,
		y1: number,
		r1: number,
	): PaintGradient;
	createPattern(image: PaintImage, repetition: string): PaintPattern | null;
}
