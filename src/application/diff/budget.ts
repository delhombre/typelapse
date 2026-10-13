/**
 * Walkthrough size budget: keep a diff walkthrough short enough to watch AND fast
 * to build.
 *
 * Windowing (see {@link ./windowing}) trims each hunk to the code around its
 * change, but nothing caps how many windows a PR contributes. A large PR (say 134
 * files) once concatenated every file's windows into every staged frame, yielding
 * ~3000-line frames: building the synchronous magic-move plan over dozens of them
 * pinned the main thread for tens of seconds, and the fit-to-viewport scaler
 * crushed the result into unreadable confetti.
 *
 * Two bounds keep that from coming back, and they bound different things:
 *
 *  - A frame never exceeds {@link MAX_SCENE_LINES} rows: the walkthrough is split
 *    in pages (see {@link ./scenes}), each played on its own, so the card is fitted
 *    to a page and the code stays readable. That is a rule on the frame, not here.
 *  - A walkthrough never exceeds {@link MAX_WALKTHROUGH_PAGES} pages, which this
 *    module enforces up front on the stage-independent window plan:
 *    {@link MAX_WALKTHROUGH_FILES} caps the changed files (document order, after
 *    lockfile filtering; the rest are dropped wholesale), and
 *    {@link MAX_WALKTHROUGH_LINES}, the pages times the rows of a page, caps the
 *    code the kept windows may render. Windows accumulate in document order (by the
 *    most lines each can render in one stage, which is stage-independent) until
 *    the budget is spent; the window that would overflow is truncated to fit and
 *    everything after it dropped. The scaffold a page adds (headers, `⋯`) can push
 *    the page count past the cap by a page or two, so `generateSnapshots` then cuts
 *    the pages themselves at {@link MAX_WALKTHROUGH_PAGES}.
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

import { MAX_SCENE_LINES } from "./scenes";
import type { DiffHunk } from "./types";
import { ELLIPSIS, type FileWindowPlan, type LineWindow } from "./windowing";

/** Show at most this many changed files; the readable head of a large PR. */
export const MAX_WALKTHROUGH_FILES = 6;

/**
 * A walkthrough (a diff, or one chapter of a pull request) plays at most this many
 * pages of {@link MAX_SCENE_LINES} rows; the marker line says what is left.
 *
 * Measured, not guessed: at the default timing (1.2 s a step, 0.65 s a transition)
 * n steps run 1.85 n - 0.65 s, and a social clip tolerates about 20 s, so about 11
 * steps. The three examples the hero proposes (honojs/hono#5189, vercel/next.js
 * #97139, oven-sh/bun #37643) already fit in 4 pages (12.3, 17.9 and 14.1 s), and
 * the 246-file comparison honojs/hono v4.6.0...v4.7.0 lands at 11 steps, 19.7 s,
 * where 8 pages ran 40 s. A product constant, to revisit when a long-form option
 * exists (docs/decisions/2026-10-13-gate-five.md, D2 follow-up).
 */
export const MAX_WALKTHROUGH_PAGES = 4;

/**
 * The code a walkthrough may render: its pages times the rows of a page. Derived,
 * not chosen, so the line budget moves with the page cap and the scene cap.
 */
export const MAX_WALKTHROUGH_LINES = MAX_WALKTHROUGH_PAGES * MAX_SCENE_LINES;

/** The marker a walkthrough ends on when changes were cut and no whole file was. */
const CHANGES_HIDDEN_MARKER = `${ELLIPSIS} more changes hidden`;

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
export function omissionMarker(droppedFiles: number, contentTruncated: boolean): string | null {
	if (droppedFiles > 0) {
		const noun = droppedFiles === 1 ? "file" : "files";
		return `${ELLIPSIS} ${droppedFiles} more ${noun}`;
	}
	if (contentTruncated) {
		return CHANGES_HIDDEN_MARKER;
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
