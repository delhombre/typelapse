/**
 * Line-number gutter labels — a tiny pure helper shared by the browser preview
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
