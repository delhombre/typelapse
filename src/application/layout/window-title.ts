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
 * count of cells at a fixed advance rather than a measurement. A cell is what
 * the code grid counts (`displayWidth`): a CJK ideograph or an emoji takes two,
 * so a title in either takes the room it draws, and a glyph is never cut.
 */

import { clusters, displayWidth } from "../text/display-width";
import { CHROME_STYLE, type ChromeVariant } from "./frame-metrics";

/** The glyph CSS puts at the cut of `text-overflow: ellipsis`. */
export const ELLIPSIS = "…";

/** Cells the ellipsis takes: U+2026 is one advance in the bar's mono. */
const ELLIPSIS_CELLS = 1;

/**
 * Cells a cut title needs before it is drawn at all: below two, the ellipsis
 * would stand alone and say nothing, so the bar draws no title instead.
 */
const MIN_CUT_CAPACITY = 2;

/**
 * Advance of one glyph of the chrome mono, in em. JetBrains Mono (the bar's
 * face) and the monospaces it falls back to measure 0.6; the code grid is set on
 * the same figure (`measureCharWidthRatio`).
 */
const CHROME_ADVANCE_EM = 0.6;

/** Slack for the float error of a width that is an exact multiple of the advance. */
const EPSILON = 1e-6;

/**
 * Width in px of one glyph of the bar's furniture (the terminal prompt, the
 * browser chevrons) at `size` and `unit`. The glyph's own face is not trusted
 * with it: U+276F and the chevrons are outside the JetBrains Mono subset, so
 * they render in whatever the machine falls back to. `FrameChrome` gives each a
 * box of exactly this width and the painter advances by it, so the room the
 * title is counted in is the room both draw it in.
 */
export function chromeGlyphAdvance(size: number, unit: number): number {
	return size * unit * CHROME_ADVANCE_EM;
}

/**
 * The em fraction of a CSS tracking such as "-0.02em". "normal" (or anything
 * else that is not a number) is no tracking, not NaN.
 */
export function trackingEm(tracking: string): number {
	const em = Number.parseFloat(tracking);
	return Number.isFinite(em) ? em : 0;
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

/**
 * Width in px of the browser bar's address pill around `label`, before its
 * `max-width` caps it: the label's display cells at the title's advance, plus the
 * pill's own padding. Counted rather than measured, so the DOM pill and the
 * painter's give a CJK or emoji label the same width whatever face a browser or
 * a worker falls back to for it (`windowTitle` cuts in the same cells).
 */
export function browserPillWidth(label: string, unit: number): number {
	const bar = CHROME_STYLE.browser;
	return displayWidth(label) * windowTitleAdvance("browser", unit) + 2 * bar.pillPadX * unit;
}

/** How many cells of title the bar has room for: zero when it has none. */
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
 * A title cut to `capacity` cells, ellipsis included. A title that fits is
 * returned whole; one with fewer than two cells of room is not drawn. Cut by the glyphs the grid places (`clusters`), so a wide
 * glyph or an emoji sequence is never cut in half, and by their cells, so a
 * title of wide glyphs stops where its width does. The cut never leaves a space
 * in front of the ellipsis, and when the next glyph is wider than the one cell
 * left over, that cell stays empty.
 */
export function fitTitleToCapacity(title: string, capacity: number): string {
	const glyphs = clusters(title);
	const cells = glyphs.reduce((sum, glyph) => sum + glyph.width, 0);
	if (cells <= capacity) {
		return title;
	}
	if (capacity < MIN_CUT_CAPACITY) {
		return "";
	}
	const budget = capacity - ELLIPSIS_CELLS;
	let kept = "";
	let used = 0;
	for (const glyph of glyphs) {
		if (used + glyph.width > budget) {
			break;
		}
		kept += glyph.text;
		used += glyph.width;
	}
	return `${kept.trimEnd()}${ELLIPSIS}`;
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
