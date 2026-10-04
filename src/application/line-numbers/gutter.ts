/**
 * Line-number gutter labels: a tiny pure helper shared by the browser preview
 * and the Remotion video so both render the same gutter.
 *
 * The labels are display-only: focus / highlight ranges stay relative to the
 * snippet's own lines (line 1 = first line) regardless of the start value, so the
 * two must never be coupled.
 */

/** Right-aligned, zero-padded (min two digits) labels: `count` rows from `start`. */
export function gutterLabels(start: number, count: number): string[] {
	const safeStart = Math.max(1, Math.floor(start));
	const rows = Math.max(0, Math.floor(count));
	return Array.from({ length: rows }, (_, i) => String(safeStart + i).padStart(2, "0"));
}

/**
 * The gutter of a window whose top is `firstRow` (`magic-move/window`),
 * fractional through a morph: labels from the row at the top, one more when a
 * row is cut by it, and `shift`, how far that row sits above the top, in rows.
 * At row 0 it is `gutterLabels` as it always was.
 */
export function scrolledGutter(
	start: number,
	count: number,
	firstRow: number,
): { labels: string[]; shift: number } {
	const top = Math.floor(firstRow);
	const shift = firstRow - top;
	return { labels: gutterLabels(start + top, count + (shift > 0 ? 1 : 0)), shift };
}
