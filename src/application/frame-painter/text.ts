/**
 * Where CSS puts a line of text, restated for a canvas.
 *
 * A canvas positions a baseline; the DOM positions a line box. CSS puts the
 * font's content area (ascent plus descent) in the line box with half the
 * leading above it, and Chromium floors that half to a whole pixel: measured in
 * the document on JetBrains Mono and Geist at nine sizes and line heights,
 * negative leading included, the baseline is always
 * `top + floor((lineHeight - ascent - descent) / 2) + ascent`. The painter used
 * to ask for `textBaseline = "middle"`, the middle of the em box: with
 * JetBrains Mono every glyph came out about 2 px high at 1080p.
 *
 * The ascent and descent are read off the context's own resolved font
 * (`fontBoundingBox*`, the metrics Chromium lays a line box out with), so the
 * answer follows whichever face this scope actually loaded.
 */

import type { PaintContext } from "./paint-context";

/** The probe string; the font's bounding box does not depend on it. */
const PROBE = "0";

/**
 * Remembers each font's ascent and descent for the life of one paint: a frame
 * sets the same few fonts hundreds of times, and the metrics of a font do not
 * change between two of its tokens.
 */
export class CssBaselines {
	readonly #metrics = new Map<string, { ascent: number; descent: number } | null>();

	constructor(private readonly ctx: PaintContext) {}

	/**
	 * Set the context's baseline and return the y to draw at, for a line box
	 * `lineHeight` tall centred on `centreY`, in the context's current font.
	 */
	at(centreY: number, lineHeight: number): number {
		const metrics = this.#fontMetrics();
		if (metrics === null) {
			// A context that reports no font metrics: the em box's middle is the
			// nearest thing it can be asked for.
			this.ctx.textBaseline = "middle";
			return centreY;
		}
		this.ctx.textBaseline = "alphabetic";
		const halfLeading = Math.floor((lineHeight - metrics.ascent - metrics.descent) / 2);
		return centreY - lineHeight / 2 + halfLeading + metrics.ascent;
	}

	/** The font's descent below the alphabetic baseline, or 0 when unknown. */
	descent(): number {
		this.ctx.textBaseline = "alphabetic";
		return this.ctx.measureText(PROBE).fontBoundingBoxDescent ?? 0;
	}

	#fontMetrics(): { ascent: number; descent: number } | null {
		const font = this.ctx.font;
		const known = this.#metrics.get(font);
		if (known !== undefined) {
			return known;
		}
		// The bounding box is measured from the current baseline, so the baseline
		// has to be the alphabetic one before the context is asked.
		const probe = this.ctx.measureText(PROBE);
		let metrics: { ascent: number; descent: number } | null = null;
		if (probe.fontBoundingBoxAscent !== undefined) {
			this.ctx.textBaseline = "alphabetic";
			const measured = this.ctx.measureText(PROBE);
			metrics = {
				ascent: measured.fontBoundingBoxAscent ?? 0,
				descent: measured.fontBoundingBoxDescent ?? 0,
			};
		}
		this.#metrics.set(font, metrics);
		return metrics;
	}
}
