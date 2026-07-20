/**
 * Deterministic code-frame metrics: pure and dependency-free.
 *
 * The Remotion video renders in headless Chrome, so it cannot measure the DOM to
 * decide how much to scale the card into the canvas. Instead it derives the
 * card's *natural* size the same way `MagicMoveCanvas` / `FrameChrome` lay it out
 * (a monospace grid of `ch` columns and fixed line rows) from a few primitives.
 * Feed the result into `fitScale` against the canvas and the whole card is always
 * visible (long files scale down instead of cropping, long lines instead of
 * clipping), matching the measured-and-scaled browser preview.
 *
 * Sizes are returned in the same px space as the inputs: pass already-scaled
 * `fontSize` / `padding` (e.g. `theme.fontSize * VIDEO_SCALE`) and the matching
 * `scale`, and the chrome bar and caption block scale with it.
 */

/** Window-chrome variants, mirrored from `FrameChrome` (kept a local union so the
 *  application layer stays free of presentation imports). */
export type ChromeVariant = "macos" | "browser" | "terminal" | "none";

/** Row height as a multiple of font size: matches `MagicMoveCanvas`. */
export const LINE_HEIGHT_RATIO = 1.6;
/** Monospace advance as a fraction of the font size: matches the video width math. */
export const CHAR_WIDTH_RATIO = 0.62;

/** Intrinsic line box of chrome-bar text (no explicit line-height); slight
 *  over-estimate so the fit leaves a hair of margin rather than cropping. */
const CHROME_TEXT_LINE_HEIGHT = 1.35;
/** StepCaption footprint below the card: marginTop 14 + reserved minHeight 20. */
const CAPTION_BLOCK = 14 + 20;

/**
 * Height in px of the window-chrome bar for a variant at `scale`. Derived from
 * the padding + content of each bar in `FrameChrome` (a 1px border folded in).
 */
export function chromeBarHeight(chrome: ChromeVariant, scale: number): number {
	if (chrome === "none") {
		return 0;
	}
	if (chrome === "browser") {
		// Padding 9, a pill address bar (padding 4 + 11px text), 1px border.
		const pill = 2 * 4 + 11 * CHROME_TEXT_LINE_HEIGHT;
		const row = Math.max(13 * CHROME_TEXT_LINE_HEIGHT, pill);
		return (2 * 9 + row + 1) * scale;
	}
	if (chrome === "terminal") {
		// Padding 9, prompt glyph (12px) vs title (11px), 1px border.
		const row = Math.max(12 * CHROME_TEXT_LINE_HEIGHT, 11 * CHROME_TEXT_LINE_HEIGHT);
		return (2 * 9 + row + 1) * scale;
	}
	// macOS: padding 12, traffic-light dots (11px) vs title (11px), 1px border.
	const row = Math.max(11, 11 * CHROME_TEXT_LINE_HEIGHT);
	return (2 * 12 + row + 1) * scale;
}

export interface FrameNaturalSizeInput {
	chrome: ChromeVariant;
	/** Widest line across all frames, in characters. */
	maxCols: number;
	/** Tallest frame across all frames, in rows (use the segment max: a constant
	 *  scale for the whole video, so it never zoom-pumps between steps). */
	maxLines: number;
	/** Font size in px, already scaled for the target. */
	fontSize: number;
	/** Code padding in px, already scaled. */
	padding: number;
	showLineNumbers: boolean;
	/** First gutter number: decides the gutter's digit width. */
	lineNumberStart: number;
	/** Whether a caption block sits below the card. */
	hasCaption: boolean;
	/** Upscale factor: chrome bar and caption block scale with it. */
	scale: number;
}

/**
 * Natural (unscaled) size of the card + caption unit, ready to feed into
 * `fitScale`. Mirrors the video's existing width math and adds the height the
 * old layout never bounded: the source of the cropping bug.
 */
export function frameNaturalSize(input: FrameNaturalSizeInput): { width: number; height: number } {
	const {
		chrome,
		maxCols,
		fontSize,
		padding,
		showLineNumbers,
		lineNumberStart,
		hasCaption,
		scale,
	} = input;
	const maxLines = Math.max(1, input.maxLines);
	const lineHeight = fontSize * LINE_HEIGHT_RATIO;

	// Height: chrome bar + code area (padding top/bottom + one row per line) + caption.
	const codeAreaHeight = 2 * padding + maxLines * lineHeight;
	const captionHeight = hasCaption ? CAPTION_BLOCK * scale : 0;
	const height = chromeBarHeight(chrome, scale) + codeAreaHeight + captionHeight;

	// Width: padding + gutter (widest rendered line number) + widest code line.
	const maxLineNo = Math.max(1, Math.floor(lineNumberStart)) + maxLines - 1;
	const gutterDigits = Math.max(2, String(maxLineNo).length);
	const gutterWidth = showLineNumbers
		? (gutterDigits + 1) * fontSize * CHAR_WIDTH_RATIO + fontSize
		: 0;
	const codeWidth = (maxCols + 2) * fontSize * CHAR_WIDTH_RATIO;
	const width = 2 * padding + gutterWidth + codeWidth;

	return { width, height };
}
