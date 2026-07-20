/**
 * Line-range parsing for the per-step spotlight: pure, framework-free.
 *
 * The step card exposes focus as a compact human string ("2-4, 7"); the domain
 * stores it as `HighlightRange[]`; the render engine wants a flat `Set` of the
 * 1-indexed lines to keep bright. These three helpers convert between them and
 * are shared by the store, the UI, and the share/JSON serialization.
 */

import { HighlightRange } from "@/domain/value-objects/highlight-range";

/** Coerce one numeric token to a line number (>= 1), or null when not a number. */
function toLine(text: string): number | null {
	if (!/^\d+$/.test(text)) {
		return null;
	}
	const n = Number.parseInt(text, 10);
	if (Number.isNaN(n)) {
		return null;
	}
	// Lines are 1-indexed; clamp anything below 1 (e.g. "0") up to the first line.
	return Math.max(1, n);
}

/** Parse one chunk ("7" or "2-4") into a range, normalizing reversed bounds. */
function parseChunk(chunk: string): HighlightRange | null {
	const parts = chunk.split("-").map((p) => p.trim());
	if (parts.length === 1) {
		const n = toLine(parts[0] ?? "");
		if (n === null) {
			return null;
		}
		return HighlightRange.create({ startLine: n, endLine: n });
	}
	if (parts.length === 2) {
		const a = toLine(parts[0] ?? "");
		const b = toLine(parts[1] ?? "");
		if (a === null || b === null) {
			return null;
		}
		return HighlightRange.create({ startLine: Math.min(a, b), endLine: Math.max(a, b) });
	}
	return null;
}

/**
 * Parse a focus string into ranges. Blank input yields `[]` (no focus). Tolerant
 * of spaces, single numbers, reversed bounds and empty chunks; returns `null` for
 * any non-numeric/malformed chunk so callers can reject the edit without a throw.
 */
export function parseLineRanges(input: string): HighlightRange[] | null {
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
		const parsed = parseChunk(chunk);
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

/** Flatten ranges to the set of 1-indexed lines the engine keeps bright. */
export function focusLineSet(ranges: readonly HighlightRange[]): Set<number> {
	const lines = new Set<number>();
	for (const range of ranges) {
		for (let line = range.startLine; line <= range.endLine; line++) {
			lines.add(line);
		}
	}
	return lines;
}
