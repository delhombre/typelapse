/**
 * The code column's clip: pure and dependency-free.
 *
 * A line longer than the window is cut at the code column's right edge, the
 * window's inner edge, as every editor cuts it, and a short fade runs over the
 * last columns before the cut so the line trails off instead of being
 * guillotined mid-glyph (decision 2026-10-07-after-the-gate D1). The answer is
 * in cells, so each renderer draws it in its own units: the DOM preview and the
 * Remotion composition as a `ch` mask on the code column (`MagicMoveCanvas`),
 * the canvas painter as a gradient over the same columns. The engine still lays
 * the whole line out, so a morph glides into the cut and the typewriter types
 * the hidden tail.
 */

/** Cells the fade spans before the clip edge: short, so the code stays readable to the cut. */
export const LINE_FADE_CELLS = 3;

/** Whatever floating point leaves of a column that lands on the edge exactly. */
const EDGE_EPSILON = 1e-9;

export interface LineClip {
	/** Whole columns the code column shows before its clip edge. */
	visibleColumns: number;
	/** The column the fade starts at: the code is opaque left of it. */
	fadeStart: number;
	/** The clip edge, in cells from the column's left, where the fade is transparent. */
	fadeEnd: number;
}

/**
 * The clip of a code column `columnWidth` px wide on a `charWidth` grid, or null
 * when its widest line (in display cells: an ideograph or an emoji takes two)
 * fits and nothing is cut.
 */
export function lineClip(input: {
	widestCells: number;
	columnWidth: number;
	charWidth: number;
}): LineClip | null {
	const { widestCells, columnWidth, charWidth } = input;
	if (charWidth <= 0) {
		return null;
	}
	const fadeEnd = columnWidth / charWidth;
	if (widestCells <= fadeEnd + EDGE_EPSILON) {
		return null;
	}
	const visibleColumns = Math.max(0, Math.floor(fadeEnd + EDGE_EPSILON));
	return {
		visibleColumns,
		fadeStart: Math.max(0, visibleColumns - LINE_FADE_CELLS),
		fadeEnd,
	};
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
