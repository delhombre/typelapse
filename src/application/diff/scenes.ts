/**
 * Scenes: keep every frame of a diff walkthrough small enough to read.
 *
 * One card serves every scene (the morph needs it), so the tallest frame sizes
 * them all. A 56-line frame in a 1080p video lands its code at about 9 px (see
 * `layout/scene-readability`), and the budget in {@link ./budget} only bounds the
 * WHOLE walkthrough. This module splits what the budget kept into pages: runs of
 * windows whose frames each hold at most {@link MAX_SCENE_LINES} rows. A page is
 * played on its own (its before-state, each hunk applied, its after-state), so
 * a frame renders only its page and the card is fitted to a page, not to the PR.
 *
 * ## Continuations
 *
 * A window taller than a page is cut in pieces at line boundaries. The same hunk
 * is kept for every piece, so the `⋯` separators fall out of the windowing rules:
 * the piece before a cut ends on one (`end < lines.length - 1`), the piece after
 * it opens with one (`start > 0`). A piece is a continuation scene; it carries the
 * caption of the hunk it continues (see {@link ../diff/snapshots}).
 *
 * The module is pure and follows the windowing it splits: no framework deps.
 */

import type { DiffHunk } from "./types";
import { type FileWindowPlan, type LineWindow, renderWindowedStage } from "./windowing";

/**
 * The most rows (code, `// path` headers, `⋯` separators and the omission marker)
 * any frame holds. Measured, not guessed: with the diff import's 14 px type at
 * the 2.2 video scale and a 72-column line, a 24-row card lands its code at 18.8
 * px in a 1920x1080 frame (a 56-row one at 9.4), and the fit crosses the 18 px
 * floor at 25 rows. One row is held back for a caption that wraps in its band.
 * `tests/application/readable-scenes.test.ts` pins both ends.
 */
export const MAX_SCENE_LINES = 24;

/** One page: the window plans it plays, and the number of each of their hunks. */
export interface ScenePage {
	plans: FileWindowPlan[];
	/** The 0-based document-order number of each hunk of {@link plans}, flattened. */
	hunkNumbers: number[];
}

/** One window of one hunk, with where it sits in the whole walkthrough. */
interface Piece {
	fileIndex: number;
	hunkNumber: number;
	hunk: DiffHunk;
	window: LineWindow;
}

function piecesOf(plans: FileWindowPlan[]): Piece[] {
	const pieces: Piece[] = [];
	let hunkNumber = 0;
	plans.forEach((plan, fileIndex) => {
		plan.hunks.forEach((hunk, hunkIndex) => {
			for (const window of plan.windows[hunkIndex] ?? []) {
				pieces.push({ fileIndex, hunkNumber, hunk, window });
			}
			hunkNumber += 1;
		});
	});
	return pieces;
}

/** Group consecutive pieces back into file plans: windows of one hunk share its entry. */
function pageOf(pieces: readonly Piece[], plans: FileWindowPlan[]): ScenePage {
	const out: FileWindowPlan[] = [];
	const hunkNumbers: number[] = [];
	let lastFile = -1;
	let lastHunk = -1;
	for (const piece of pieces) {
		if (piece.fileIndex !== lastFile) {
			out.push({ path: plans[piece.fileIndex]?.path ?? "", hunks: [], windows: [] });
			lastFile = piece.fileIndex;
			lastHunk = -1;
		}
		const plan = out[out.length - 1];
		if (!plan) {
			continue;
		}
		if (piece.hunkNumber !== lastHunk) {
			plan.hunks.push(piece.hunk);
			plan.windows.push([]);
			hunkNumbers.push(piece.hunkNumber);
			lastHunk = piece.hunkNumber;
		}
		plan.windows[plan.windows.length - 1]?.push({ ...piece.window });
	}
	return { plans: out, hunkNumbers };
}

/** The most rows any stage of a page renders. */
function pageRows(page: ScenePage, showHeaders: boolean): number {
	const hunkCount = page.hunkNumbers.length;
	let most = 0;
	for (let applied = 0; applied <= hunkCount; applied++) {
		most = Math.max(most, renderWindowedStage(page.plans, applied, showHeaders).split("\n").length);
	}
	return most;
}

/**
 * Split the budgeted window plans into pages of at most {@link MAX_SCENE_LINES}
 * rows. `reserve` rows are kept free for the omission marker, which every page
 * carries (it is the same line on each, so a morph never moves it). A diff that already fits comes back as one page holding every plan.
 */
export function splitIntoScenes(plans: FileWindowPlan[], reserve = 0): ScenePage[] {
	const cap = MAX_SCENE_LINES - reserve;
	const showHeaders = plans.length > 1;
	const fits = (pieces: readonly Piece[]) => pageRows(pageOf(pieces, plans), showHeaders) <= cap;

	const queue = piecesOf(plans);
	const pages: ScenePage[] = [];
	let current: Piece[] = [];

	while (queue.length > 0) {
		const piece = queue.shift();
		if (!piece) {
			break;
		}
		if (fits([...current, piece])) {
			current.push(piece);
			continue;
		}
		if (current.length > 0) {
			pages.push(pageOf(current, plans));
			current = [];
			queue.unshift(piece);
			continue;
		}
		// Alone and still too tall: cut it where the page is full, continue after.
		let end = piece.window.start;
		while (
			end < piece.window.end &&
			fits([{ ...piece, window: { start: piece.window.start, end: end + 1 } }])
		) {
			end += 1;
		}
		pages.push(pageOf([{ ...piece, window: { start: piece.window.start, end } }], plans));
		if (end < piece.window.end) {
			queue.unshift({ ...piece, window: { start: end + 1, end: piece.window.end } });
		}
	}
	if (current.length > 0) {
		pages.push(pageOf(current, plans));
	}
	return pages;
}

/** True when a page's before-state shows code of its own (not only `⋯` and headers). */
export function hasBeforeCode(page: ScenePage): boolean {
	return page.plans.some((plan) =>
		plan.hunks.some((hunk, hunkIndex) =>
			(plan.windows[hunkIndex] ?? []).some((window) =>
				hunk.lines.slice(window.start, window.end + 1).some((line) => line.type !== "add"),
			),
		),
	);
}
