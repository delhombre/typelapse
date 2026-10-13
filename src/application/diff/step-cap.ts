/**
 * The most steps a diff walkthrough plays, and what happens past it.
 *
 * A walkthrough is bounded by pages ({@link ./budget}), but a page holds one step
 * per hunk, so a diff of many small hunks still reaches 48 steps (4 pages of 12
 * stages), and a pull request chaptered by commit multiplies that by its commits.
 * Past {@link MAX_DIFF_STEPS} the video ends early, and it says so: whole chapters
 * are kept from the start, the tail is dropped, and the last kept step carries a
 * `⋯ n more scenes` row, the same kind of row the budget's marker is, so the
 * viewer sees the story stop rather than jump from a middle change to "After".
 *
 * Pure: it composes sibling diff modules and has no framework deps.
 */

import type { CodeSnapshot } from "./types";
import { ELLIPSIS } from "./windowing";

/**
 * The most steps a walkthrough plays: a duration budget, not a safety valve.
 * At the default timing (1.2 s a step, 0.65 s a transition) n steps run
 * 1.85 n - 0.65 s, so 16 steps run 28.95 s, under the 30 s a social clip
 * tolerates (17 would run 30.8 s). The cases measured for the page budget
 * (docs/decisions/2026-10-13-gate-five.md, D2 follow-up) stay whole: the three
 * hero examples (honojs/hono#5189, vercel/next.js#97139, oven-sh/bun#37643) are
 * 7, 10 and 8 steps and the 246-file honojs/hono v4.6.0...v4.7.0 is 11, so none
 * is cut. At the old 40 one file of 45 small hunks still played 74 s. A release's
 * title card counts as one of them ({@link stepBudget}). A product constant, to
 * revisit with a long-form option.
 */
export const MAX_DIFF_STEPS = 16;

/**
 * The steps a walkthrough may play: {@link MAX_DIFF_STEPS}, less the title card a
 * release opens on, which is a step of the video like any other (the ceiling is
 * a duration).
 */
export function stepBudget(openingCard: boolean): number {
	return MAX_DIFF_STEPS - (openingCard ? 1 : 0);
}

export interface CappedWalkthrough {
	/** The kept steps, the last one carrying the marker when something was dropped. */
	snapshots: CodeSnapshot[];
	/** Chapters that start the video (a chapter cut in two still counts). */
	shownChapters: number;
	totalChapters: number;
	/** True when the head of the first chapter plays and the chapter itself is cut. */
	cutWithinChapter: boolean;
	/** Steps the video plays. */
	shownSteps: number;
	/** Steps the video does not play; 0 when the whole walkthrough fit. */
	omittedSteps: number;
}

/** What a cap decided, without the frames: what an import reports back. */
export type WalkthroughCut = Omit<CappedWalkthrough, "snapshots">;

/** The row a walkthrough ends on when its tail was dropped. */
function scenesMarker(omitted: number): string {
	return `${ELLIPSIS} ${omitted} more ${omitted === 1 ? "scene" : "scenes"}`;
}

/**
 * The last kept frame with the cap's marker on it. A frame is already at most
 * {@link MAX_SCENE_LINES} rows with the budget's own marker row in them, and the
 * card is sized by the tallest frame, so the cap's marker takes that row over
 * instead of adding one: `⋯ 4 more files` becomes `⋯ 4 more files, 37 more
 * changes`, and the generic `⋯ more changes hidden` gives way to the count.
 */
function markCut(code: string, omitted: number): string {
	const marker = scenesMarker(omitted);
	if (code === "") {
		return marker;
	}
	const lines = code.split("\n");
	const lastLine = lines[lines.length - 1] ?? "";
	if (!lastLine.startsWith(`${ELLIPSIS} `)) {
		return `${code}\n${marker}`;
	}
	const own = /^⋯ \d+ more files?$/.test(lastLine) ? `${lastLine}, ${omitted} more scenes` : marker;
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
			cutWithinChapter: false,
			shownSteps: total,
			omittedSteps: 0,
		};
	}

	let kept: CodeSnapshot[] = [];
	let shownChapters = 0;
	let cutWithinChapter = false;
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
		cutWithinChapter = true;
	}

	const omittedSteps = total - kept.length;
	const last = kept[kept.length - 1];
	const snapshots = last
		? [...kept.slice(0, -1), { ...last, code: markCut(last.code, omittedSteps) }]
		: kept;
	return {
		snapshots,
		shownChapters,
		totalChapters: sequences.length,
		cutWithinChapter,
		shownSteps: kept.length,
		omittedSteps,
	};
}

/**
 * What the import says when the video plays only the head of the walkthrough, or
 * `null` when everything plays. A pull request chaptered by commit counts the
 * commits it kept; a single change, or a first commit that is itself cut, counts
 * scenes (the steps the marker row counts too).
 */
export function cutNotice(cut: WalkthroughCut): string | null {
	if (cut.omittedSteps === 0) {
		return null;
	}
	if (cut.totalChapters > 1 && !cut.cutWithinChapter) {
		return `Showing the first ${cut.shownChapters} of ${cut.totalChapters} commits`;
	}
	return `Showing the first ${cut.shownSteps} of ${cut.shownSteps + cut.omittedSteps} scenes`;
}
