/**
 * How many monospace cells a text takes: pure, no dependency.
 *
 * A monospace font gives every Latin letter one advance, but a terminal (and
 * every code editor) gives CJK ideographs, kana, Hangul, fullwidth forms and
 * emoji two, because their glyphs are about twice as wide. The magic-move grid
 * counted one cell per UTF-16 code unit instead, so `"世界";` drew the `;`
 * over the `界`, and an astral emoji (two code units) was counted right only by
 * accident. This is the wcwidth idea, restated small:
 *
 * - 2 cells: East Asian Wide and Fullwidth blocks, and emoji whose default
 *   presentation is the colour glyph (the pictograph blocks plus the handful
 *   of BMP symbols in `WIDE`).
 * - 0 cells: combining marks, zero-width spaces and joiners, variation
 *   selectors, tag characters. They draw on the glyph before them.
 * - 1 cell: everything else.
 *
 * Text is walked by code point, never by code unit, and grouped into clusters:
 * a base code point with the zero-width ones that follow it, the code point
 * after a zero-width joiner (a family emoji is one glyph), a skin-tone modifier
 * on its emoji, a pair of regional indicators (a flag), and a text symbol
 * followed by VS16 (`❤️`), which asks for the two-cell emoji glyph.
 *
 * Deliberately not here: Unicode's full East Asian Width and emoji data. The
 * ranges below cover the scripts and emoji code actually contains; a rare
 * character outside them counts as one cell, as it did before.
 */

/** Inclusive code point ranges that take two cells, in ascending order. */
const WIDE: readonly (readonly [number, number])[] = [
	[0x1100, 0x115f], // Hangul Jamo initial consonants
	[0x231a, 0x231b], // ⌚⌛
	[0x2329, 0x232a], // angle brackets (East Asian Wide)
	[0x23e9, 0x23ec], // ⏩⏪⏫⏬
	[0x23f0, 0x23f0], // ⏰
	[0x23f3, 0x23f3], // ⏳
	[0x25fd, 0x25fe], // ◽◾
	[0x2614, 0x2615], // ☔☕
	[0x2648, 0x2653], // zodiac
	[0x267f, 0x267f], // ♿
	[0x2693, 0x2693], // ⚓
	[0x26a1, 0x26a1], // ⚡
	[0x26aa, 0x26ab], // ⚪⚫
	[0x26bd, 0x26be], // ⚽⚾
	[0x26c4, 0x26c5], // ⛄⛅
	[0x26ce, 0x26ce], // ⛎
	[0x26d4, 0x26d4], // ⛔
	[0x26ea, 0x26ea], // ⛪
	[0x26f2, 0x26f3], // ⛲⛳
	[0x26f5, 0x26f5], // ⛵
	[0x26fa, 0x26fa], // ⛺
	[0x26fd, 0x26fd], // ⛽
	[0x2705, 0x2705], // ✅
	[0x270a, 0x270b], // ✊✋
	[0x2728, 0x2728], // ✨
	[0x274c, 0x274c], // ❌
	[0x274e, 0x274e], // ❎
	[0x2753, 0x2755], // ❓❔❕
	[0x2757, 0x2757], // ❗
	[0x2795, 0x2797], // ➕➖➗
	[0x27b0, 0x27b0], // ➰
	[0x27bf, 0x27bf], // ➿
	[0x2b1b, 0x2b1c], // ⬛⬜
	[0x2b50, 0x2b50], // ⭐
	[0x2b55, 0x2b55], // ⭕
	[0x2e80, 0x303e], // CJK radicals, Kangxi, CJK symbols and punctuation
	[0x3041, 0x33ff], // kana, Bopomofo, Hangul compatibility jamo, enclosed CJK
	[0x3400, 0x4dbf], // CJK extension A
	[0x4e00, 0x9fff], // CJK unified ideographs
	[0xa000, 0xa4cf], // Yi
	[0xa960, 0xa97f], // Hangul Jamo extended A
	[0xac00, 0xd7a3], // Hangul syllables
	[0xf900, 0xfaff], // CJK compatibility ideographs
	[0xfe10, 0xfe19], // vertical forms
	[0xfe30, 0xfe6f], // CJK compatibility forms, small form variants
	[0xff00, 0xff60], // fullwidth forms
	[0xffe0, 0xffe6], // fullwidth signs
	[0x1f004, 0x1f004], // 🀄
	[0x1f0cf, 0x1f0cf], // 🃏
	[0x1f18e, 0x1f18e], // 🆎
	[0x1f191, 0x1f19a], // 🆑..🆚
	[0x1f200, 0x1f2ff], // enclosed ideographic supplement
	[0x1f300, 0x1f64f], // pictographs, emoticons
	[0x1f680, 0x1f6ff], // transport and map
	[0x1f7e0, 0x1f7eb], // coloured circles and squares
	[0x1f90c, 0x1f9ff], // supplemental symbols and pictographs
	[0x1fa70, 0x1faff], // symbols and pictographs extended A
	[0x20000, 0x3fffd], // CJK extensions B onward
];

/** Inclusive code point ranges that take no cell, in ascending order. */
const ZERO: readonly (readonly [number, number])[] = [
	[0x0300, 0x036f], // combining diacritical marks
	[0x0483, 0x0489], // Cyrillic combining
	[0x0591, 0x05bd], // Hebrew points
	[0x064b, 0x065f], // Arabic harakat
	[0x0e31, 0x0e31], // Thai
	[0x0e34, 0x0e3a],
	[0x0e47, 0x0e4e],
	[0x1ab0, 0x1aff], // combining diacritical marks extended
	[0x1dc0, 0x1dff], // combining diacritical marks supplement
	[0x200b, 0x200f], // zero-width space, non-joiner, joiner, direction marks
	[0x202a, 0x202e], // bidi embedding controls
	[0x2060, 0x2064], // word joiner, invisible operators
	[0x20d0, 0x20ff], // combining marks for symbols (keycap)
	[0xfe00, 0xfe0f], // variation selectors
	[0xfe20, 0xfe2f], // combining half marks
	[0xfeff, 0xfeff], // byte order mark
	[0xe0000, 0xe007f], // tags (subdivision flags)
	[0xe0100, 0xe01ef], // variation selectors supplement
];

/** Below U+0300 every code point is one cell: the common case skips the walk. */
function isNarrowOnly(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) >= 0x0300) {
			return false;
		}
	}
	return true;
}

const ZERO_WIDTH_JOINER = 0x200d;
const EMOJI_PRESENTATION = 0xfe0f;
const SKIN_TONE_FIRST = 0x1f3fb;
const SKIN_TONE_LAST = 0x1f3ff;
const REGIONAL_FIRST = 0x1f1e6;
const REGIONAL_LAST = 0x1f1ff;

function inRanges(point: number, ranges: readonly (readonly [number, number])[]): boolean {
	let low = 0;
	let high = ranges.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		const range = ranges[mid];
		if (!range) {
			return false;
		}
		if (point < range[0]) {
			high = mid - 1;
		} else if (point > range[1]) {
			low = mid + 1;
		} else {
			return true;
		}
	}
	return false;
}

/** Cells one code point takes on its own: 0, 1 or 2. */
export function codePointWidth(point: number): 0 | 1 | 2 {
	if (point < 0x0300) {
		return 1;
	}
	if (inRanges(point, ZERO)) {
		return 0;
	}
	return inRanges(point, WIDE) ? 2 : 1;
}

/** A glyph on the grid: its text, its index in the source (UTF-16) and its cells. */
export interface Cluster {
	text: string;
	start: number;
	width: number;
}

function isRegional(point: number): boolean {
	return point >= REGIONAL_FIRST && point <= REGIONAL_LAST;
}

/**
 * Split a text into the glyphs a monospace grid places, with their cell widths.
 * A newline and a tab are clusters of their own that nothing joins; the caller
 * decides what they advance.
 */
export function clusters(text: string): Cluster[] {
	const out: Cluster[] = [];
	let current: Cluster | null = null;
	let previous = -1;
	// The current cluster is one regional indicator, waiting for its pair.
	let loneRegional = false;
	let index = 0;
	for (const char of text) {
		const point = char.codePointAt(0) ?? 0;
		const width = codePointWidth(point);
		if (current && joinsCluster(current, point, width, previous, loneRegional)) {
			current.text += char;
			if (point === EMOJI_PRESENTATION && current.width === 1) {
				current.width = 2;
			} else if (loneRegional && isRegional(point)) {
				current.width += width;
			}
			loneRegional = false;
		} else {
			current = { text: char, start: index, width };
			out.push(current);
			loneRegional = isRegional(point);
		}
		previous = point;
		index += char.length;
	}
	return out;
}

function joinsCluster(
	current: Cluster,
	point: number,
	width: number,
	previous: number,
	loneRegional: boolean,
): boolean {
	if (current.text === "\n" || current.text === "\t") {
		return false;
	}
	return (
		width === 0 ||
		previous === ZERO_WIDTH_JOINER ||
		(point >= SKIN_TONE_FIRST && point <= SKIN_TONE_LAST) ||
		(loneRegional && isRegional(point))
	);
}

/**
 * The first glyph boundary at or after UTF-16 `index`: where a cut through the
 * text keeps every glyph whole (never half a surrogate pair, never a letter
 * without its accent, never part of a joined emoji).
 */
export function glyphBoundary(text: string, index: number): number {
	if (index <= 0) {
		return 0;
	}
	if (index >= text.length) {
		return text.length;
	}
	if (isNarrowOnly(text)) {
		return index;
	}
	for (const cluster of clusters(text)) {
		const end = cluster.start + cluster.text.length;
		if (end >= index) {
			return cluster.start === index ? index : end;
		}
	}
	return text.length;
}

/** Cells a text takes on the monospace grid. */
export function displayWidth(text: string): number {
	if (isNarrowOnly(text)) {
		return text.length;
	}
	let cells = 0;
	for (const cluster of clusters(text)) {
		cells += cluster.width;
	}
	return cells;
}

/**
 * A stretch of a token a renderer draws in one go: narrow glyphs run together
 * and advance one cell each in a monospace face; a wide glyph stands alone, so
 * the renderer can centre it on its two cells whatever its own advance is (a
 * CJK fallback face is 1em, an emoji face wider still, two cells are 1.2em in
 * JetBrains Mono).
 */
export interface CellRun {
	text: string;
	/** First cell of the run, relative to the start of the text. */
	col: number;
	cells: number;
	wide: boolean;
}

/** The runs of a text, in order. A text with no wide glyph is a single run. */
export function cellRuns(text: string): CellRun[] {
	if (isNarrowOnly(text)) {
		return text === "" ? [] : [{ text, col: 0, cells: text.length, wide: false }];
	}
	const runs: CellRun[] = [];
	let col = 0;
	let narrow: CellRun | null = null;
	for (const cluster of clusters(text)) {
		if (cluster.width === 2) {
			narrow = null;
			runs.push({ text: cluster.text, col, cells: 2, wide: true });
		} else if (narrow) {
			narrow.text += cluster.text;
			narrow.cells += cluster.width;
		} else {
			narrow = { text: cluster.text, col, cells: cluster.width, wide: false };
			runs.push(narrow);
		}
		col += cluster.width;
	}
	return runs;
}
