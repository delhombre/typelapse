import { displayWidth } from "../text/display-width";

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
 * `fontSize` / `padding` (e.g. `theme.fontSize * renderScaleFor(...)`) and the matching
 * `scale`, and the chrome bar and caption block scale with it.
 */

/** Window-chrome variants, mirrored from `FrameChrome` (kept a local union so the
 *  application layer stays free of presentation imports). */
export type ChromeVariant = "macos" | "browser" | "terminal" | "none";

/** Row height as a multiple of font size: matches `MagicMoveCanvas`. */
export const LINE_HEIGHT_RATIO = 1.6;

/** Line height of chrome-bar text: `FrameChrome` sets it explicitly, so the bar
 *  both DOM renderers lay out is exactly as tall as `chromeBarHeight` says. */
export const CHROME_TEXT_LINE_HEIGHT = 1.35;
/** Gap between the window and its caption, in unscaled px. */
export const CAPTION_MARGIN_TOP = 14;
/** One caption line's height, in unscaled px: `StepCaption`'s line-height. */
export const CAPTION_LINE_HEIGHT = 20;
/** The caption's type size, in unscaled px. */
export const CAPTION_FONT_SIZE = 13;
/**
 * The most lines a caption wraps to. A caption is up to 80 characters and a
 * card can be narrower than that on one line, so it wraps; past two lines it is
 * cut with an ellipsis.
 */
export const CAPTION_MAX_LINES = 2;
/**
 * Advance of one display cell of the caption's proportional face (Inter Medium),
 * in em. Lowercase prose averages a little under this; capitals and digits are
 * wider and take `CAPTION_CAPITAL_EM`. A count is an estimate, not a
 * measurement: where it is short of the face, `StepCaption` clamps at the
 * reserved lines with an ellipsis, so the band's geometry still holds.
 */
const CAPTION_CELL_EM = 0.5;
/** Advance of a capital or a digit of the caption's face, in em. */
const CAPTION_CAPITAL_EM = 0.62;
/** A capital or a digit counts as this many cells. */
const CAPITAL_CELLS = CAPTION_CAPITAL_EM / CAPTION_CELL_EM;

/** Cells a word takes: its display width, with capitals and digits counted wider. */
function wordCells(word: string): number {
	const wide = word.match(/[A-Z0-9]/g)?.length ?? 0;
	return displayWidth(word) + wide * (CAPITAL_CELLS - 1);
}

/**
 * How many lines a caption takes in a window `width` px wide, at `unit` (the
 * scale the type is drawn at): 0 for none, 1 or 2, never more (the third is the
 * ellipsis). Counted from display cells against the caption's type size, with no
 * measurement, so the preview, the video and the painter's band all get the same
 * answer from the same two numbers. Words wrap; one longer than a line breaks.
 */
export function captionLines(caption: string, width: number, unit: number): number {
	const words = caption.trim().split(/\s+/);
	if (words[0] === "") {
		return 0;
	}
	const cells = Math.max(1, Math.floor(width / (CAPTION_FONT_SIZE * unit * CAPTION_CELL_EM)));
	let lines = 1;
	let used = 0;
	const place = (cost: number) => {
		let rest = cost;
		while (rest > cells) {
			rest -= cells;
			lines++;
		}
		used = rest;
	};
	for (const word of words) {
		const cost = wordCells(word);
		if (used === 0) {
			place(cost);
		} else if (used + 1 + cost <= cells) {
			used += 1 + cost;
		} else {
			lines++;
			place(cost);
		}
		if (lines >= CAPTION_MAX_LINES) {
			return CAPTION_MAX_LINES;
		}
	}
	return lines;
}

/**
 * The lines the caption band reserves for a whole video: its longest caption's.
 * One number for every scene, so a caption fading in never moves the frame.
 */
export function captionBandLines(captions: readonly string[], width: number, unit: number): number {
	return captions.reduce((most, caption) => Math.max(most, captionLines(caption, width, unit)), 0);
}

/**
 * Height the caption band takes under the window, scaled for the target: the
 * part of the card + caption unit that is not the window. `lines` is
 * `captionBandLines`; 0 is no band. The painter bakes no caption yet but has to
 * budget it, or its card is larger and lower than the one both DOM renderers
 * centre.
 */
export function captionBlockHeight(lines: number, scale: number): number {
	return lines > 0 ? (CAPTION_MARGIN_TOP + CAPTION_LINE_HEIGHT * lines) * scale : 0;
}

/**
 * The chrome bar's font stack, which is neither the theme's nor the UI's.
 *
 * The bar is drawn inside the video frame, so it is content and not studio
 * chrome: the UI's mono is Ioskeley Mono (docs/design/DECISIONS.md D11), and
 * JetBrains Mono is the registry code font this bar has always been set in.
 * `FrameChrome` sets its title and its glyphs in it regardless of what the code
 * is set in, so a canvas painting the same bar has to ask for the same stack, and
 * the renderer has to load it alongside the theme's font. Changing it changes
 * every export's bar, and the height measured from it, in all three renderers.
 */
export const CHROME_FONT_STACK = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Secondary text remains quieter than code while passing 4.5:1 after it is
 * composited onto every built-in theme. Hex alpha keeps DOM, Remotion and the
 * canvas painter on the exact same tint.
 */
export const FRAME_SECONDARY_ALPHA_HEX = "cc";

/**
 * Every number and tint the three chrome bars are built from, in unscaled px.
 *
 * One table, read by all three surfaces: `FrameChrome` styles itself from it,
 * `chromeBarHeight` sizes the card from it, and the frame painter draws from it.
 * The bars were previously three sets of literals in one file and a partial copy
 * of one of them in another, which is how the canvas came to render `browser`
 * and `terminal` as an empty bar with a hairline under it.
 *
 * Alphas are the two hex digits the components append to the theme foreground,
 * so a tint can be checked against the CSS by eye rather than by arithmetic.
 */
export const CHROME_STYLE = {
	/** The hairline every bar closes with. */
	borderAlpha: "0f",
	border: 1,
	titleAlpha: FRAME_SECONDARY_ALPHA_HEX,
	macos: {
		padX: 16,
		padY: 12,
		gap: 8,
		dot: 11,
		lights: ["#ff5f57", "#febc2e", "#28c840"],
		titleSize: 11,
		titleTracking: "-0.02em",
	},
	browser: {
		padX: 14,
		padY: 9,
		gap: 10,
		chevrons: ["‹", "›"],
		chevronSize: 13,
		chevronGap: 7,
		chevronAlpha: "40",
		/** The address pill may take this fraction of the space left between the
		 *  chevrons and the right-hand spacer. */
		pillMaxWidth: 0.72,
		pillAlpha: "0d",
		pillPadX: 12,
		pillPadY: 4,
		/** A radius no bar can reach, which is how CSS spells a pill. */
		pillRadius: 999,
		titleSize: 11,
		titleTracking: "-0.01em",
		/** Right spacer keeping the pill optically centred against the chevrons. */
		spacer: 21,
	},
	terminal: {
		padX: 16,
		padY: 9,
		gap: 8,
		prompt: "❯",
		promptSize: 12,
		promptWeight: 600,
		promptAlpha: "80",
		titleSize: 11,
		titleTracking: "-0.01em",
		/** The terminal bar is the only one with a fill of its own. */
		barAlpha: "08",
	},
} as const;

/**
 * Height of a bar's content row in unscaled px: the tallest of its children,
 * which is what a centred flex row is as tall as.
 */
export function chromeRowHeight(chrome: ChromeVariant): number {
	if (chrome === "none") {
		return 0;
	}
	if (chrome === "browser") {
		const { chevronSize, pillPadY, titleSize } = CHROME_STYLE.browser;
		const pill = 2 * pillPadY + titleSize * CHROME_TEXT_LINE_HEIGHT;
		return Math.max(chevronSize * CHROME_TEXT_LINE_HEIGHT, pill);
	}
	if (chrome === "terminal") {
		const { promptSize, titleSize } = CHROME_STYLE.terminal;
		return Math.max(promptSize, titleSize) * CHROME_TEXT_LINE_HEIGHT;
	}
	const { dot, titleSize } = CHROME_STYLE.macos;
	return Math.max(dot, titleSize * CHROME_TEXT_LINE_HEIGHT);
}

/** Vertical padding of a bar in unscaled px. */
export function chromePadY(chrome: ChromeVariant): number {
	if (chrome === "none") {
		return 0;
	}
	return CHROME_STYLE[chrome].padY;
}

/**
 * Height in px of the window-chrome bar for a variant at `scale`: its padding,
 * its content row and the hairline that closes it.
 */
export function chromeBarHeight(chrome: ChromeVariant, scale: number): number {
	if (chrome === "none") {
		return 0;
	}
	return (2 * chromePadY(chrome) + chromeRowHeight(chrome) + CHROME_STYLE.border) * scale;
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
	/** Every scene's caption (blank for none): the band under the card takes the longest's lines. */
	captions: readonly string[];
	/** Upscale factor: chrome bar and caption block scale with it. */
	scale: number;
	/**
	 * Monospace advance as a fraction of the font size, measured in the font the
	 * target paints with (`measureCharWidthRatio`). There is no default: the
	 * nominal 0.62 the server once assumed sized its window 36 px wider than the
	 * glyphs inside it at 1080p.
	 */
	charWidthRatio: number;
}

/**
 * Natural (unscaled) size of the card + caption unit, ready to feed into
 * `fitScale`. Mirrors the video's existing width math and adds the height the
 * old layout never bounded: the source of the cropping bug.
 */
export function frameNaturalSize(input: FrameNaturalSizeInput): {
	width: number;
	height: number;
	/** The lines the caption band reserves (0 when no scene has a caption). */
	captionLines: number;
} {
	const { chrome, maxCols, fontSize, padding, showLineNumbers, lineNumberStart, captions, scale } =
		input;
	const maxLines = Math.max(1, input.maxLines);
	const charRatio = input.charWidthRatio;
	const lineHeight = fontSize * LINE_HEIGHT_RATIO;

	// Width: padding + gutter (widest rendered line number) + widest code line.
	const maxLineNo = Math.max(1, Math.floor(lineNumberStart)) + maxLines - 1;
	const gutterDigits = Math.max(2, String(maxLineNo).length);
	const gutterWidth = showLineNumbers ? (gutterDigits + 1) * fontSize * charRatio + fontSize : 0;
	const codeWidth = (maxCols + 2) * fontSize * charRatio;
	const width = 2 * padding + gutterWidth + codeWidth;

	// Height: chrome bar + code area (padding top/bottom + one row per line) + the
	// caption band, whose lines follow from the width just found.
	const lines = captionBandLines(captions, width, scale);
	const codeAreaHeight = 2 * padding + maxLines * lineHeight;
	const height = chromeBarHeight(chrome, scale) + codeAreaHeight + captionBlockHeight(lines, scale);

	return { width, height, captionLines: lines };
}

/**
 * Width of the line-number column, exactly as the DOM lays it out: a border-box
 * flex item whose width is the wider of its `minWidth` of `digits + 1`
 * characters and its content plus the font-size gutter gap, with two digits at
 * the least. What sits between the window's padding and the code column.
 */
export function gutterColumnWidth(input: {
	showLineNumbers: boolean;
	/** The deepest label the gutter shows. */
	lastLine: number;
	charWidth: number;
	fontSize: number;
}): number {
	if (!input.showLineNumbers) {
		return 0;
	}
	const digits = Math.max(2, String(Math.max(1, Math.floor(input.lastLine))).length);
	return Math.max((digits + 1) * input.charWidth, digits * input.charWidth + input.fontSize);
}
