/**
 * The most steps a diff walkthrough plays, and what happens past it.
 *
 * A walkthrough is bounded by pages ({@link ./budget}), but a page holds one step
 * per hunk, so a diff of many small hunks still reaches 48 steps (4 pages of 12
 * stages), and a pull request chaptered by commit multiplies that by its commits.
 * Past {@link MAX_DIFF_STEPS} the video ends early, and it says so: whole chapters
 * are kept from the start, the tail is dropped, and the last kept step carries a
 * `⋯ n more changes` row, the same kind of row the budget's marker is, so the
 * viewer sees the story stop rather than jump from a middle change to "After".
 *
 * Pure: it composes sibling diff modules and has no framework deps.
 */

import type { CodeSnapshot } from "./types";
import { ELLIPSIS } from "./windowing";

/** Upper bound on diff-generated steps so a pathological diff can't explode playback. */
export const MAX_DIFF_STEPS = 40;

export interface CappedWalkthrough {
	/** The kept steps, the last one carrying the marker when something was dropped. */
	snapshots: CodeSnapshot[];
	/** Chapters that start the video (a chapter cut in two still counts). */
	shownChapters: number;
	totalChapters: number;
	/** Steps the video does not play; 0 when the whole walkthrough fit. */
	omittedSteps: number;
}

/** The row a walkthrough ends on when its tail was dropped. */
function changesMarker(omitted: number): string {
	return `${ELLIPSIS} ${omitted} more ${omitted === 1 ? "change" : "changes"}`;
}

/**
 * The last kept frame with the cap's marker on it. A frame is already at most
 * {@link MAX_SCENE_LINES} rows with the budget's own marker row in them, and the
 * card is sized by the tallest frame, so the cap's marker takes that row over
 * instead of adding one: `⋯ 4 more files` becomes `⋯ 4 more files, 37 more
 * changes`, and the generic `⋯ more changes hidden` gives way to the count.
 */
function markCut(code: string, omitted: number): string {
	const marker = changesMarker(omitted);
	if (code === "") {
		return marker;
	}
	const lines = code.split("\n");
	const lastLine = lines[lines.length - 1] ?? "";
	if (!lastLine.startsWith(`${ELLIPSIS} `)) {
		return `${code}\n${marker}`;
	}
	const own = /^⋯ \d+ more files?$/.test(lastLine)
		? `${lastLine}, ${omitted} more changes`
		: marker;
	return [...lines.slice(0, -1), own].join("\n");
}

/**
 * Cap a walkthrough, given as one snapshot sequence per chapter (a plain diff is
 * a single chapter), at {@link MAX_DIFF_STEPS}. Whole chapters are kept in order
 * while they fit; when the first one alone is past the cap, it is cut at the cap.
 */
export function capWalkthrough(
	sequences: CodeSnapshot[][],
	max: number = MAX_DIFF_STEPS,
): CappedWalkthrough {
	const total = sequences.reduce((sum, sequence) => sum + sequence.length, 0);
	if (total <= max) {
		return {
			snapshots: sequences.flat(),
			shownChapters: sequences.length,
			totalChapters: sequences.length,
			omittedSteps: 0,
		};
	}

	let kept: CodeSnapshot[] = [];
	let shownChapters = 0;
	for (const sequence of sequences) {
		if (kept.length + sequence.length > max) {
			break;
		}
		kept = kept.concat(sequence);
		shownChapters += 1;
	}
	if (shownChapters === 0) {
		// The first chapter is past the cap on its own: play its head.
		kept = (sequences[0] ?? []).slice(0, max);
		shownChapters = 1;
	}

	const omittedSteps = total - kept.length;
	const last = kept[kept.length - 1];
	const snapshots = last
		? [...kept.slice(0, -1), { ...last, code: markCut(last.code, omittedSteps) }]
		: kept;
	return { snapshots, shownChapters, totalChapters: sequences.length, omittedSteps };
}

/**
 * What the import says when a pull request's tail was cut, or `null` when every
 * commit plays (or there was only the one change to play).
 */
export function commitsShownNotice(shown: number, total: number): string | null {
	if (total <= 1 || shown >= total) {
		return null;
	}
	return `Showing the first ${shown} of ${total} commits`;
}
