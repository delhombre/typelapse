/**
 * Line-range parsing for the per-step spotlight: pure, framework-free.
 *
 * The step card exposes focus as a compact human string ("2-4, 7"); the domain
 * stores it as `HighlightRange[]`; the render engine wants a flat `Set` of the
 * 1-indexed lines to keep bright. The helpers below convert between them and
 * are shared by the store, the UI, and the share/JSON serialization. Two
 * parses, on purpose: the field refuses what a person cannot mean, and opening
 * a project keeps what it holds; the clamp to the step's lines is at use.
 */

import { HighlightRange } from "@/domain/value-objects/highlight-range";

/**
 * One numeric token as a whole number, or null when it is not one. Past the
 * largest safe integer it is that integer: no step has that many lines, and the
 * number still prints as digits.
 */
function toNumber(text: string): number | null {
	if (!/^\d+$/.test(text)) {
		return null;
	}
	return Math.min(Number.parseInt(text, 10), Number.MAX_SAFE_INTEGER);
}

/** One chunk ("7" or "2-4") as its two bounds, as written, or null when unreadable. */
function boundsOf(chunk: string): [number, number] | null {
	const parts = chunk.split("-").map((p) => p.trim());
	if (parts.length > 2) {
		return null;
	}
	const start = toNumber(parts[0] ?? "");
	const end = parts.length === 1 ? start : toNumber(parts[1] ?? "");
	return start === null || end === null ? null : [start, end];
}

/** Every chunk of a focus string through `read`; null as soon as one is unreadable. */
function eachChunk(
	input: string,
	read: (bounds: [number, number]) => HighlightRange | null,
): HighlightRange[] | null {
	const ranges: HighlightRange[] = [];
	for (const rawChunk of input.trim().split(",")) {
		const chunk = rawChunk.trim();
		if (chunk === "") {
			continue;
		}
		const bounds = boundsOf(chunk);
		const range = bounds === null ? null : read(bounds);
		if (range === null) {
			return null;
		}
		ranges.push(range);
	}
	return ranges;
}

/**
 * The focus field's parse: what a person types. Blank input yields `[]` (no
 * focus); spaces, single numbers and empty chunks are fine. It returns `null`
 * for anything it cannot take as lines of this step (non-numeric, line 0, a
 * reversed range like `5-2`, a start past the last line), so the field shows
 * itself invalid instead of rewriting what was typed. With the step's
 * `lineCount`, a range's end is clamped to the last line (`1-99` on five lines
 * is `1-5`).
 */
export function parseLineRanges(input: string, lineCount?: number): HighlightRange[] | null {
	return eachChunk(input, ([start, end]) => {
		if (start < 1 || end < start) {
			return null;
		}
		if (lineCount !== undefined && start > lineCount) {
			return null;
		}
		return HighlightRange.create({
			startLine: start,
			endLine: lineCount === undefined ? end : Math.min(end, lineCount),
		});
	});
}

/**
 * The first line the field refused only for being past the step's last line, or
 * null when the input is refused for anything else (or not refused at all).
 * It lets the field say "line 9 is past the last line" instead of the generic
 * hint, since a number that reads fine is not a typo.
 */
export function firstLinePastEnd(input: string, lineCount: number): number | null {
	const wherever = parseLineRanges(input);
	if (wherever === null || parseLineRanges(input, lineCount) !== null) {
		return null;
	}
	return wherever.find((range) => range.startLine > lineCount)?.startLine ?? null;
}

/**
 * Read a focus string a project already holds (a file, the draft, a share link,
 * the undo history). Nothing is clamped or refused here: a range past the last
 * line, or line 0, is kept as written and `focusLineSet` leaves out what the
 * step does not have. Only a reversed range is turned round, since a range
 * cannot hold it. Opening a project never rewrites its focus.
 */
export function readLineRanges(input: string): HighlightRange[] | null {
	return eachChunk(input, ([a, b]) =>
		HighlightRange.create({ startLine: Math.min(a, b), endLine: Math.max(a, b) }),
	);
}

/**
 * A stored focus in the one spelling a code block holds: the ranges it can
 * read, ascending, from line 1. What it cannot hold is not line numbers a scene
 * could ever light (not numbers at all, or line 0) and is left out, so a project
 * with an odd focus still opens, with no focus there, instead of being refused
 * whole. The rest, a range past the last line included, is kept for `focusLineSet`
 * to clamp where it is drawn.
 */
export function holdableFocus(input: string): string | undefined {
	const ranges = readLineRanges(input);
	if (ranges === null) {
		return undefined;
	}
	const holdable = ranges.filter((range) => range.startLine >= 1);
	return holdable.length > 0 ? formatLineRanges(holdable) : undefined;
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
