/**
 * Hunk windowing: make a diff walkthrough readable on real-world PRs.
 *
 * A staged snapshot without windowing renders every line that appears across a
 * file's hunks. A regenerated lockfile or a wide-context diff then produces a
 * frame thousands of pixels tall that the fit-to-viewport scaler shrinks into
 * unreadable confetti. Windowing shows, like GitHub's diff view, only the code
 * around each change (± {@link CONTEXT_LINES} context lines), with stable `⋯`
 * separators between the windows and `// <path>` headers between files.
 *
 * The module is pure: it imports only the sibling diff types and has no
 * framework dependencies.
 *
 * ## Why the windows are stable across stages
 *
 * The Magic Move engine matches tokens across consecutive snapshots: content
 * that is byte-identical between two stages stays put, content that differs
 * enters/leaves. So the walkthrough only morphs cleanly if the windows are
 * structurally identical across every stage. They are: window boundaries,
 * separators and headers are all deterministic functions of the (stage-
 * independent) hunk structure. Only the code *inside* a window changes between
 * stages (and exactly one hunk flips per step) so everything else matches as
 * a stable token and glides rather than churns.
 *
 * Line numbers: the presentation gutter is display-only and sequential, so
 * windowed code shows 1..N over the rendered lines (the `⋯` rows included), not
 * the original file's line numbers. Mapping the gutter back to real file lines
 * is a future nicety, out of scope here.
 */

import type { DiffFile, DiffHunk } from "./types";

/** Context lines kept on each side of a changed region. */
export const CONTEXT_LINES = 3;

/** Two padded windows closer than this (in lines) merge instead of splitting. */
export const MERGE_GAP = 2;

/** The separator that stands in for elided code. Kept byte-identical everywhere. */
export const ELLIPSIS = "⋯";

/** An inclusive range of indices into a hunk's `lines` array (document order). */
export interface LineWindow {
	start: number;
	end: number;
}

/**
 * A file's windowing, computed once and shared by every snapshot stage. Holding
 * the hunks alongside their windows lets the renderer emit either side (before
 * or after) of each window without recomputing boundaries per stage.
 */
export interface FileWindowPlan {
	/** Display path used for the `// <path>` header in multi-file diffs. */
	path: string;
	hunks: DiffHunk[];
	/** One window list per hunk, parallel to {@link hunks}. */
	windows: LineWindow[][];
}

const LOCKFILE_BASENAMES = new Set([
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"bun.lockb",
]);

/** The last path segment, or the whole string when there is no slash. */
function basename(path: string): string {
	return path.split("/").pop() ?? path;
}

/**
 * True for a dependency lockfile: walkthroughs of generated lockfiles are noise.
 * Matches the well-known basenames plus any `*.lock` file (Cargo.lock, poetry.lock…).
 */
export function isLockfile(path: string | null | undefined): boolean {
	if (!path) {
		return false;
	}
	const base = basename(path).toLowerCase();
	if (base.endsWith(".lock")) {
		return true;
	}
	return LOCKFILE_BASENAMES.has(base);
}

/**
 * Drop lockfiles from the file list. If *every* file is a lockfile the list is
 * returned untouched: a lockfile walkthrough still beats an empty import.
 */
export function filterLockfiles(files: DiffFile[]): DiffFile[] {
	const kept = files.filter((file) => !isLockfile(file.newPath ?? file.oldPath));
	return kept.length > 0 ? kept : files;
}

/**
 * The windows for a single hunk, in document order over its `lines`. Each
 * changed line is padded by `context` lines on each side (clamped to the hunk),
 * and windows whose gap is `mergeGap` lines or less coalesce so a lone kept line
 * never floats between two separators.
 */
export function computeHunkWindows(
	hunk: DiffHunk,
	context = CONTEXT_LINES,
	mergeGap = MERGE_GAP,
): LineWindow[] {
	const n = hunk.lines.length;
	const windows: LineWindow[] = [];

	for (let i = 0; i < n; i++) {
		const line = hunk.lines[i];
		if (!line || line.type === "context") {
			continue;
		}
		const start = Math.max(0, i - context);
		const end = Math.min(n - 1, i + context);
		const last = windows[windows.length - 1];
		if (last && start - last.end - 1 <= mergeGap) {
			last.end = Math.max(last.end, end);
		} else {
			windows.push({ start, end });
		}
	}

	return windows;
}

/** Compute every file's windows once, ready to render at any stage. */
export function planWindows(files: DiffFile[]): FileWindowPlan[] {
	return files.map((file) => ({
		path: file.newPath ?? file.oldPath ?? "",
		hunks: file.hunks,
		windows: file.hunks.map((hunk) => computeHunkWindows(hunk)),
	}));
}

/** The header line that attributes the windows below it to a file. */
export function fileHeaderLine(path: string): string {
	return `// ${path}`;
}

/**
 * A window's lines for one stage: the "after" side (context + additions) once
 * the hunk is applied, the "before" side (context + removals) until then.
 */
function renderWindow(hunk: DiffHunk, window: LineWindow, applied: boolean): string[] {
	const out: string[] = [];
	for (let i = window.start; i <= window.end; i++) {
		const line = hunk.lines[i];
		if (!line) {
			continue;
		}
		if (applied && line.type === "remove") {
			continue;
		}
		if (!applied && line.type === "add") {
			continue;
		}
		out.push(line.content);
	}
	return out;
}

/** Old-side lines hidden between two hunks (they were far enough apart to split). */
function realGap(prev: DiffHunk, next: DiffHunk): number {
	return next.oldStart - (prev.oldStart + prev.oldLines);
}

/** Whether a separator belongs before a window that opens a non-first hunk. */
function needsHunkBoundarySeparator(prev: DiffHunk, next: DiffHunk): boolean {
	return realGap(prev, next) > MERGE_GAP;
}

/** Render one file's windows for a stage (no header: the caller adds it). */
function renderFileStage(
	plan: FileWindowPlan,
	appliedHunks: number,
	globalStart: number,
): string[] {
	const out: string[] = [];
	let emitted = false;
	let prevHunkIndex = -1;
	let prevHunk: DiffHunk | undefined;
	let prevWindow: LineWindow | undefined;

	// A plain loop (not `forEach`) keeps the `prev*` mutations in this scope, so
	// the trailing-separator check below narrows cleanly.
	for (let hunkIndex = 0; hunkIndex < plan.hunks.length; hunkIndex++) {
		const hunk = plan.hunks[hunkIndex];
		if (!hunk) {
			continue;
		}
		const applied = globalStart + hunkIndex < appliedHunks;
		const windows = plan.windows[hunkIndex] ?? [];

		for (const window of windows) {
			if (!emitted) {
				// Leading separator: hidden lines above the first window, either the
				// hunk begins mid-file, or its own leading context was trimmed.
				if (hunk.oldStart > 1 || window.start > 0) {
					out.push(ELLIPSIS);
				}
			} else if (hunkIndex === prevHunkIndex) {
				// Two windows of one hunk always straddle trimmed interior lines.
				out.push(ELLIPSIS);
			} else if (prevHunk && needsHunkBoundarySeparator(prevHunk, hunk)) {
				out.push(ELLIPSIS);
			}

			out.push(...renderWindow(hunk, window, applied));
			emitted = true;
			prevHunkIndex = hunkIndex;
			prevHunk = hunk;
			prevWindow = window;
		}
	}

	// Trailing separator only when we trimmed the last hunk's own tail. A diff
	// never reveals the file's length, so a window that reaches its hunk's end
	// may or may not be at EOF: we don't guess.
	if (prevHunk && prevWindow && prevWindow.end < prevHunk.lines.length - 1) {
		out.push(ELLIPSIS);
	}

	return out;
}

/**
 * Render the whole diff at a stage: the first `appliedHunks` hunks (in document
 * order across files) render "after", the rest "before". Files are labelled with
 * a `// <path>` header when the diff touches more than one. A scene that shows
 * one file of a multi-file diff passes `showHeaders` to keep its header.
 */
export function renderWindowedStage(
	plans: FileWindowPlan[],
	appliedHunks: number,
	showHeaders = plans.length > 1,
): string {
	const multiFile = showHeaders;
	const out: string[] = [];
	let globalHunk = 0;

	for (const plan of plans) {
		if (multiFile) {
			// Emit the header even for an empty section (a not-yet-applied new file)
			// so the header stays byte-identical across stages and morphs cleanly.
			out.push(fileHeaderLine(plan.path));
		}
		out.push(...renderFileStage(plan, appliedHunks, globalHunk));
		globalHunk += plan.hunks.length;
	}

	return out.join("\n");
}
