/**
 * Walkthrough size budget: keep a diff walkthrough readable AND fast to build.
 *
 * Windowing (see {@link ./windowing}) trims each hunk to the code around its
 * change, but nothing caps the TOTAL size of a frame across many files. A large
 * PR (say 134 files) therefore still concatenates every file's windows into every
 * staged frame, yielding ~3000-line frames. Building the synchronous magic-move
 * plan over dozens of such frames pins the main thread for tens of seconds and the
 * fit-to-viewport scaler crushes the result into unreadable confetti.
 *
 * This module caps a frame two ways, both derived once from the stage-independent
 * window plan:
 *
 *  - {@link MAX_WALKTHROUGH_FILES}: only the first N changed files (document order,
 *    after lockfile filtering) are shown; the rest are dropped wholesale.
 *  - {@link MAX_WALKTHROUGH_LINES}: the total rendered code lines in any single
 *    frame. Windows are accumulated in document order (by the most lines each can
 *    render in one stage, which is stage-independent) until the budget is spent; the
 *    window that would overflow is truncated to fit and everything after it dropped.
 *
 * ## Why this stays clean across stages
 *
 * The Magic Move engine only morphs cleanly when the scaffold (which files, which
 * windows, where the separators fall) is byte-identical across every stage. This
 * budget is computed from the window plan alone, which is a pure function of the
 * hunk structure and carries no notion of "before" vs "after". So the SAME set of
 * files and the SAME (possibly truncated) window boundaries feed every stage: only
 * the code inside a window flips between its before/after side, exactly as without
 * the budget. Truncating a window shrinks its `end` by a stage-independent amount,
 * so its trailing `⋯` and the single omission marker land identically everywhere.
 *
 * The module is pure: it composes sibling diff types and has no framework deps.
 */

import type { DiffHunk } from "./types";
import { ELLIPSIS, type FileWindowPlan, type LineWindow } from "./windowing";

/** Show at most this many changed files; the readable head of a large PR. */
export const MAX_WALKTHROUGH_FILES = 6;

/**
 * Cap the rendered code lines in any single frame at this. ~50 keeps a frame
 * glanceable and, crucially, keeps the synchronous magic-move plan build fast: the
 * freeze this fixes came from ~3000-line frames, so an order of magnitude smaller
 * frame is both readable and cheap to lay out.
 */
export const MAX_WALKTHROUGH_LINES = 50;

export interface BudgetedWalkthrough {
	/** The kept (and possibly truncated) file window plans, in document order. */
	plans: FileWindowPlan[];
	/**
	 * One stable trailing line summarizing what was omitted, or `null` when the
	 * whole diff fit. Byte-identical across every stage by construction.
	 */
	marker: string | null;
}

/**
 * The most code lines a window can render in ANY single stage: its context plus the
 * larger of its additions and removals, since a stage renders context + one side
 * (added when the hunk is applied, removed until then), never both. This is a pure
 * function of the window's line structure, so budgeting by it is stage-independent
 * yet still bounds the rendered frame from above.
 */
function windowRenderCost(hunk: DiffHunk, window: LineWindow): number {
	let context = 0;
	let additions = 0;
	let removals = 0;
	for (let i = window.start; i <= window.end; i++) {
		const line = hunk.lines[i];
		if (!line) {
			continue;
		}
		if (line.type === "add") {
			additions += 1;
		} else if (line.type === "remove") {
			removals += 1;
		} else {
			context += 1;
		}
	}
	return context + Math.max(additions, removals);
}

/**
 * The largest `end` (>= the window start) whose sub-window renders at most `budget`
 * lines in any stage. The cost only ever grows as the window extends, so the first
 * line that would overflow is the cut point.
 */
function truncateWindowEnd(hunk: DiffHunk, window: LineWindow, budget: number): number {
	let context = 0;
	let additions = 0;
	let removals = 0;
	let end = window.start;
	for (let i = window.start; i <= window.end; i++) {
		const line = hunk.lines[i];
		if (!line) {
			continue;
		}
		const nextContext = context + (line.type === "context" ? 1 : 0);
		const nextAdditions = additions + (line.type === "add" ? 1 : 0);
		const nextRemovals = removals + (line.type === "remove" ? 1 : 0);
		if (nextContext + Math.max(nextAdditions, nextRemovals) > budget) {
			break;
		}
		context = nextContext;
		additions = nextAdditions;
		removals = nextRemovals;
		end = i;
	}
	return end;
}

/** The single omission line: prefers a dropped-file count, else a generic notice. */
function omissionMarker(droppedFiles: number, contentTruncated: boolean): string | null {
	if (droppedFiles > 0) {
		const noun = droppedFiles === 1 ? "file" : "files";
		return `${ELLIPSIS} ${droppedFiles} more ${noun}`;
	}
	if (contentTruncated) {
		return `${ELLIPSIS} more changes hidden`;
	}
	return null;
}

/**
 * Apply the file and line budget to a window plan, returning the kept plans plus a
 * stable omission marker (or `null` when nothing was dropped). The input plans are
 * never mutated: kept hunks are reused by reference, windows are copied so a
 * truncation never leaks back into the caller's plan.
 */
export function budgetWalkthrough(plans: FileWindowPlan[]): BudgetedWalkthrough {
	const totalFiles = plans.length;
	// File cap first: only the first N files are even candidates for the line budget.
	const candidates = plans.slice(0, MAX_WALKTHROUGH_FILES);

	let remaining = MAX_WALKTHROUGH_LINES;
	let contentTruncated = false;
	const outPlans: FileWindowPlan[] = [];

	for (const plan of candidates) {
		const keptHunks: DiffHunk[] = [];
		const keptWindows: LineWindow[][] = [];

		for (let hunkIndex = 0; hunkIndex < plan.hunks.length; hunkIndex++) {
			const hunk = plan.hunks[hunkIndex];
			const windows = plan.windows[hunkIndex];
			if (!hunk || !windows) {
				continue;
			}

			const hunkWindows: LineWindow[] = [];
			for (const window of windows) {
				if (remaining <= 0) {
					break;
				}
				const cost = windowRenderCost(hunk, window);
				if (cost <= remaining) {
					hunkWindows.push({ start: window.start, end: window.end });
					remaining -= cost;
				} else {
					// Truncate the overflowing window to what the budget still allows. The
					// new `end` is stage-independent, so its trailing `⋯` is stable.
					const end = truncateWindowEnd(hunk, window, remaining);
					hunkWindows.push({ start: window.start, end });
					remaining = 0;
					contentTruncated = true;
				}
			}

			if (hunkWindows.length < windows.length) {
				contentTruncated = true;
			}
			if (hunkWindows.length > 0) {
				keptHunks.push(hunk);
				keptWindows.push(hunkWindows);
			} else if (windows.length > 0) {
				contentTruncated = true;
			}
		}

		if (keptHunks.length > 0) {
			outPlans.push({ path: plan.path, hunks: keptHunks, windows: keptWindows });
		}
	}

	// Dropped files = everything beyond the file cap PLUS any candidate whose hunks
	// were all starved by the line budget, so the marker's count is honest.
	const droppedFiles = totalFiles - outPlans.length;
	return { plans: outPlans, marker: omissionMarker(droppedFiles, contentTruncated) };
}
