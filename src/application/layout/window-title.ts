/**
 * The title in the window chrome: one line, cut with an ellipsis at the width
 * the bar leaves it. Pure and dependency-free.
 *
 * Three surfaces draw this bar (the DOM preview, the Remotion composition that
 * imports the same `FrameChrome`, and the canvas painter), and they used to
 * disagree on a long title: the preview let it wrap onto a second line and grew
 * the bar, the file painted one clipped line. CSS `text-overflow` cannot be
 * asked of a canvas, and asking each surface to measure would let them differ by
 * a glyph, so the string is decided here, from the window's width and the bar's
 * own numbers (`CHROME_STYLE`), and every surface draws exactly that string.
 *
 * The bar's type is monospace (`CHROME_FONT_STACK`), so "how much fits" is a
 * count of characters at a fixed advance rather than a measurement.
 */

import { CHROME_STYLE, type ChromeVariant } from "./frame-metrics";

/** The glyph CSS puts at the cut of `text-overflow: ellipsis`. */
export const ELLIPSIS = "…";

/**
 * Advance of one glyph of the chrome mono, in em. JetBrains Mono (the bar's
 * face) and the monospaces it falls back to measure 0.6; the code grid is set on
 * the same figure (`measureCharWidthRatio`).
 */
const CHROME_ADVANCE_EM = 0.6;

/** Slack for the float error of a width that is an exact multiple of the advance. */
const EPSILON = 1e-6;

/** The em fraction of a CSS tracking such as "-0.02em". */
function trackingEm(tracking: string): number {
	return Number.parseFloat(tracking);
}

/**
 * Width in px of one title character at `unit`: the glyph's advance plus the
 * title's own tracking, which CSS and a canvas both add after every glyph.
 */
export function windowTitleAdvance(chrome: ChromeVariant, unit: number): number {
	if (chrome === "none") {
		return CHROME_ADVANCE_EM * unit;
	}
	const bar = CHROME_STYLE[chrome];
	return bar.titleSize * unit * (CHROME_ADVANCE_EM + trackingEm(bar.titleTracking));
}

/**
 * Width in px of the box the bar's title is set in, for a window `windowWidth`
 * wide at `unit` (the bar's px per editor px: 1 in the preview, the render scale
 * in the exports). Zero or less means the bar has no room for a title at all.
 *
 * Each bar's flex row is laid out the way the DOM lays it out:
 * - macos: padding, three lights, one gap after each, the title's own left
 *   margin (one more gap), padding.
 * - terminal: padding, the prompt glyph, a gap, the title, padding.
 * - browser: the title lives in an address pill that is at most `pillMaxWidth`
 *   of the flex child between the chevrons and the right spacer, inside the
 *   pill's own horizontal padding.
 */
export function windowTitleRoom(chrome: ChromeVariant, windowWidth: number, unit: number): number {
	if (chrome === "none") {
		return 0;
	}
	if (chrome === "macos") {
		const bar = CHROME_STYLE.macos;
		const lights = bar.lights.length;
		return windowWidth - unit * (2 * bar.padX + lights * bar.dot + (lights + 1) * bar.gap);
	}
	if (chrome === "terminal") {
		const bar = CHROME_STYLE.terminal;
		return windowWidth - unit * (2 * bar.padX + bar.promptSize * CHROME_ADVANCE_EM + bar.gap);
	}
	const bar = CHROME_STYLE.browser;
	const chevrons =
		bar.chevrons.length * bar.chevronSize * CHROME_ADVANCE_EM +
		(bar.chevrons.length - 1) * bar.chevronGap;
	const flex = windowWidth - unit * (2 * bar.padX + chevrons + bar.spacer + 2 * bar.gap);
	return bar.pillMaxWidth * flex - 2 * bar.pillPadX * unit;
}

/** How many title characters the bar has room for: zero when it has none. */
export function windowTitleCapacity(
	chrome: ChromeVariant,
	windowWidth: number,
	unit: number,
): number {
	const room = windowTitleRoom(chrome, windowWidth, unit);
	if (room <= 0) {
		return 0;
	}
	return Math.floor(room / windowTitleAdvance(chrome, unit) + EPSILON);
}

/**
 * A title cut to `capacity` characters, ellipsis included. A title that fits is
 * returned whole. Counted in code points, so an emoji is never cut in half, and
 * the cut never leaves a space in front of the ellipsis.
 */
export function fitTitleToCapacity(title: string, capacity: number): string {
	const glyphs = Array.from(title);
	if (glyphs.length <= capacity) {
		return title;
	}
	if (capacity <= 0) {
		return "";
	}
	return `${glyphs
		.slice(0, capacity - 1)
		.join("")
		.trimEnd()}${ELLIPSIS}`;
}

/**
 * The string the bar draws: `title` on one line, cut with an ellipsis at the
 * width a `windowWidth`-wide window leaves it. The one function the DOM preview,
 * the Remotion composition and the frame painter all call.
 */
export function windowTitle(
	title: string,
	chrome: ChromeVariant,
	windowWidth: number,
	unit: number,
): string {
	return fitTitleToCapacity(title, windowTitleCapacity(chrome, windowWidth, unit));
}
