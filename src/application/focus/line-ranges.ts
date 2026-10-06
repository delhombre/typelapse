/**
 * Line-range parsing for the per-step spotlight: pure, framework-free.
 *
 * The step card exposes focus as a compact human string ("2-4, 7"); the domain
 * stores it as `HighlightRange[]`; the render engine wants a flat `Set` of the
 * 1-indexed lines to keep bright. These three helpers convert between them and
 * are shared by the store, the UI, and the share/JSON serialization.
 */

import { HighlightRange } from "@/domain/value-objects/highlight-range";

/**
 * Coerce one numeric token to a line number, or null when it is not one: lines
 * are 1-indexed, so `0` is not a line (it used to be rewritten to line 1, which
 * is a different request than the one typed).
 */
function toLine(text: string): number | null {
	if (!/^\d+$/.test(text)) {
		return null;
	}
	const n = Number.parseInt(text, 10);
	if (!Number.isFinite(n) || n < 1) {
		return null;
	}
	return n;
}

/**
 * Parse one chunk ("7" or "2-4") into a range. A reversed range ("5-2") is
 * refused, not silently flipped; with a `lineCount`, the end is clamped to the
 * last line and a range that starts past it is refused.
 */
function parseChunk(chunk: string, lineCount: number | undefined): HighlightRange | null {
	const parts = chunk.split("-").map((p) => p.trim());
	if (parts.length > 2) {
		return null;
	}
	const start = toLine(parts[0] ?? "");
	const end = parts.length === 1 ? start : toLine(parts[1] ?? "");
	if (start === null || end === null || end < start) {
		return null;
	}
	if (lineCount !== undefined && start > lineCount) {
		return null;
	}
	return HighlightRange.create({
		startLine: start,
		endLine: lineCount === undefined ? end : Math.min(end, lineCount),
	});
}

/**
 * Parse a focus string into ranges. Blank input yields `[]` (no focus). Tolerant
 * of spaces, single numbers and empty chunks; returns `null` for anything it
 * cannot read as lines (non-numeric, line 0, reversed bounds, a start past the
 * last line) so callers can show the field as invalid instead of rewriting it.
 * Pass the step's `lineCount` to clamp a range to the code it spotlights.
 */
export function parseLineRanges(input: string, lineCount?: number): HighlightRange[] | null {
	const trimmed = input.trim();
	if (trimmed === "") {
		return [];
	}
	const ranges: HighlightRange[] = [];
	for (const rawChunk of trimmed.split(",")) {
		const chunk = rawChunk.trim();
		if (chunk === "") {
			continue;
		}
		const parsed = parseChunk(chunk, lineCount);
		if (parsed === null) {
			return null;
		}
		ranges.push(parsed);
	}
	return ranges;
}

/** Format ranges back to their canonical string ("2-4, 7"); inverse of parse. */
export function formatLineRanges(ranges: readonly HighlightRange[]): string {
	return ranges
		.map((r) => (r.startLine === r.endLine ? `${r.startLine}` : `${r.startLine}-${r.endLine}`))
		.join(", ");
}

/**
 * Flatten ranges to the set of 1-indexed lines the engine keeps bright, never
 * past the step's last line: a stored "1-1000000" is a range, not a million
 * lines, and the set is at most `lineCount` big whatever a file or a share link
 * asked for.
 */
export function focusLineSet(ranges: readonly HighlightRange[], lineCount: number): Set<number> {
	const lines = new Set<number>();
	for (const range of ranges) {
		const last = Math.min(range.endLine, lineCount);
		for (let line = Math.max(1, range.startLine); line <= last; line++) {
			lines.add(line);
		}
	}
	return lines;
}
