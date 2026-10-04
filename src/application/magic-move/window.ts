/**
 * Where each step's plan window sits on a long file: pure.
 *
 * The plan lays out `VISIBLE_ROW_LIMIT` rows per step (`plan.ts`). Anchored at
 * the top, an edit at line 1,408 of a 3,000-line file never reached a frame, so
 * the window follows the story instead: the focus band when the step has one,
 * else the first line the step changes against its neighbour, else the top. A
 * file that fits the window never scrolls. Every renderer reads the rows from
 * the same plan and scrolls between them on the morph's easing, so the preview,
 * the painter and the server move together.
 */

import { VISIBLE_ROW_LIMIT } from "../layout/canvas-fit";

/**
 * Rows of code kept above the anchor, so the band reads in its context. Well
 * inside the rows the floor shows on the shortest shipped canvas (about 60 on
 * 16:9), which leaves room under it for a long band.
 */
export const WINDOW_LEAD_ROWS = 8;

/** The first 0-indexed row two codes differ on, or null when they are the same. */
export function firstChangedRow(a: string, b: string): number | null {
	if (a === b) {
		return null;
	}
	let row = 0;
	const end = Math.min(a.length, b.length);
	for (let i = 0; i < end; i++) {
		if (a.charCodeAt(i) !== b.charCodeAt(i)) {
			return row;
		}
		if (a.charCodeAt(i) === 10) {
			row++;
		}
	}
	// One code is the other plus more: the more starts on the next row when it
	// opens with a line break, else it extends this one.
	const longer = a.length > b.length ? a : b;
	return longer.charCodeAt(end) === 10 ? row + 1 : row;
}

function rowCount(code: string): number {
	let rows = 1;
	for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) {
		rows++;
	}
	return rows;
}

function bandTop(focus: Iterable<number> | undefined): number | null {
	let top: number | null = null;
	for (const line of focus ?? []) {
		// A request's focus is data: a line that is not a line number anchors nothing.
		if (Number.isFinite(line)) {
			top = top === null ? line : Math.min(top, line);
		}
	}
	return top === null ? null : Math.max(0, Math.floor(top) - 1);
}

/**
 * The first row of each step's window. `focus` holds each step's 1-indexed
 * focused lines, index-aligned with `codes`. A step without focus anchors on
 * what changed coming in from the step before, else going out to the step
 * after; one that changes nothing stays where the step before left the window,
 * so a held step never jumps back to the top.
 */
export function planWindowRows(
	codes: readonly string[],
	focus: readonly (Iterable<number> | undefined)[] = [],
): number[] {
	const rows: number[] = [];
	codes.forEach((code, i) => {
		const lastStart = rowCount(code) - VISIBLE_ROW_LIMIT;
		const previous = codes[i - 1];
		const next = codes[i + 1];
		const band = bandTop(focus[i]);
		if (lastStart <= 0) {
			rows.push(0);
		} else if (band === null && code === previous) {
			rows.push(rows[i - 1] ?? 0);
		} else {
			const anchor =
				band ??
				(previous === undefined ? null : firstChangedRow(code, previous)) ??
				(next === undefined ? null : firstChangedRow(code, next)) ??
				0;
			rows.push(Math.min(Math.max(0, anchor - WINDOW_LEAD_ROWS), lastStart));
		}
	});
	return rows;
}

/** The row a frame's window starts on; a frame without one starts at the top. */
export function frameFirstRow(frame: { firstRow?: number } | undefined): number {
	return frame?.firstRow ?? 0;
}

/**
 * Tokens on absolute rows, moved to rows of a window whose top is `firstRow`
 * (fractional through a morph). At the top the array comes back as it is, so a
 * file that fits the window paints exactly what it did before windows moved.
 */
export function scrollRows<T extends { line: number }>(tokens: T[], firstRow: number): T[] {
	if (firstRow === 0) {
		return tokens;
	}
	return tokens.map((token) => ({ ...token, line: token.line - firstRow }));
}
