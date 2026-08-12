import type {
	PaintContext,
	PaintGradient,
	PaintPattern,
} from "@/application/frame-painter/paint-context";

/**
 * A 2D context that draws nothing and remembers everything.
 *
 * The painter is pure: for a given scene and time it must emit one exact
 * sequence of drawing commands. jsdom has no canvas backend (and Node has no
 * `OffscreenCanvas`), so pixels cannot be hashed in this environment; the
 * command list is the next best invariant, and a strictly stronger one for
 * ordering questions like "does the mesh paint bottom-up?".
 */
export class RecordingContext implements PaintContext {
	readonly commands: string[] = [];

	#fillStyle: string | PaintGradient | PaintPattern = "#000000";
	#globalAlpha = 1;
	#globalCompositeOperation = "source-over";
	#font = "10px sans-serif";
	#textAlign = "start";
	#textBaseline = "alphabetic";
	#letterSpacing = "0px";

	get fillStyle(): string | PaintGradient | PaintPattern {
		return this.#fillStyle;
	}

	set fillStyle(value: string | PaintGradient | PaintPattern) {
		this.#fillStyle = value;
		this.commands.push(`fillStyle=${describe(value)}`);
	}

	get globalAlpha(): number {
		return this.#globalAlpha;
	}

	set globalAlpha(value: number) {
		this.#globalAlpha = value;
		this.commands.push(`globalAlpha=${round(value)}`);
	}

	get globalCompositeOperation(): string {
		return this.#globalCompositeOperation;
	}

	set globalCompositeOperation(value: string) {
		this.#globalCompositeOperation = value;
		this.commands.push(`globalCompositeOperation=${value}`);
	}

	get font(): string {
		return this.#font;
	}

	set font(value: string) {
		this.#font = value;
		this.commands.push(`font=${value}`);
	}

	get textAlign(): string {
		return this.#textAlign;
	}

	set textAlign(value: string) {
		this.#textAlign = value;
		this.commands.push(`textAlign=${value}`);
	}

	get textBaseline(): string {
		return this.#textBaseline;
	}

	set textBaseline(value: string) {
		this.#textBaseline = value;
		this.commands.push(`textBaseline=${value}`);
	}

	get letterSpacing(): string {
		return this.#letterSpacing;
	}

	set letterSpacing(value: string) {
		this.#letterSpacing = value;
		this.commands.push(`letterSpacing=${value}`);
	}

	save(): void {
		this.commands.push("save");
	}

	restore(): void {
		this.commands.push("restore");
	}

	translate(x: number, y: number): void {
		this.commands.push(`translate(${round(x)},${round(y)})`);
	}

	scale(x: number, y: number): void {
		this.commands.push(`scale(${round(x)},${round(y)})`);
	}

	beginPath(): void {
		this.commands.push("beginPath");
	}

	rect(x: number, y: number, w: number, h: number): void {
		this.commands.push(`rect(${round(x)},${round(y)},${round(w)},${round(h)})`);
	}

	roundRect(x: number, y: number, w: number, h: number, radii?: number): void {
		this.commands.push(
			`roundRect(${round(x)},${round(y)},${round(w)},${round(h)},${round(radii ?? 0)})`,
		);
	}

	arc(x: number, y: number, radius: number, start: number, end: number): void {
		this.commands.push(
			`arc(${round(x)},${round(y)},${round(radius)},${round(start)},${round(end)})`,
		);
	}

	fill(): void {
		this.commands.push("fill");
	}

	clip(): void {
		this.commands.push("clip");
	}

	fillRect(x: number, y: number, w: number, h: number): void {
		this.commands.push(`fillRect(${round(x)},${round(y)},${round(w)},${round(h)})`);
	}

	clearRect(x: number, y: number, w: number, h: number): void {
		this.commands.push(`clearRect(${round(x)},${round(y)},${round(w)},${round(h)})`);
	}

	drawImage(_image: unknown, dx: number, dy: number, dw: number, dh: number): void {
		this.commands.push(`drawImage(${round(dx)},${round(dy)},${round(dw)},${round(dh)})`);
	}

	fillText(text: string, x: number, y: number): void {
		this.commands.push(`fillText(${JSON.stringify(text)},${round(x)},${round(y)})`);
	}

	measureText(text: string): { width: number } {
		// A perfect monospace of advance 0.6em, so tests can predict every position.
		// The size is read out of the shorthand rather than off its front, because
		// a weight or an `italic` gets there first (`600 26.4px "…"`).
		const size = Number.parseFloat(/(\d*\.?\d+)px/.exec(this.#font)?.[1] ?? "") || 10;
		const tracking = /^(-?[\d.]+)em$/.exec(this.#letterSpacing)?.[1];
		const advance = size * (0.6 + Number(tracking ?? 0));
		return { width: text.length * advance };
	}

	createLinearGradient(x0: number, y0: number, x1: number, y1: number): PaintGradient {
		const id = `linear(${round(x0)},${round(y0)},${round(x1)},${round(y1)})`;
		this.commands.push(`createLinearGradient ${id}`);
		const stops: string[] = [];
		return {
			id,
			stops,
			addColorStop(offset: number, color: string) {
				stops.push(`${round(offset)}:${color}`);
			},
		} as PaintGradient & { id: string; stops: string[] };
	}

	createRadialGradient(
		x0: number,
		y0: number,
		r0: number,
		x1: number,
		y1: number,
		r1: number,
	): PaintGradient {
		const id = `radial(${round(x0)},${round(y0)},${round(r0)},${round(x1)},${round(y1)},${round(r1)})`;
		this.commands.push(`createRadialGradient ${id}`);
		const stops: string[] = [];
		return {
			id,
			stops,
			addColorStop(offset: number, color: string) {
				stops.push(`${round(offset)}:${color}`);
			},
		} as PaintGradient & { id: string; stops: string[] };
	}

	createPattern(_image: unknown, repetition: string): PaintPattern | null {
		this.commands.push(`createPattern(${repetition})`);
		return { id: `pattern(${repetition})` } as PaintPattern & { id: string };
	}
}

function describe(value: string | PaintGradient | PaintPattern): string {
	if (typeof value === "string") {
		return value;
	}
	const tagged = value as { id?: string; stops?: string[] };
	if (tagged.stops) {
		return `${tagged.id}[${tagged.stops.join("|")}]`;
	}
	return tagged.id ?? "object";
}

/** Positions are floats; pin them to sub-micron precision so a hash is stable. */
export function round(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}
