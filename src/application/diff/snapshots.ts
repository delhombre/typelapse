import { MAX_WALKTHROUGH_PAGES, budgetWalkthrough, omissionMarker } from "./budget";
import { type ScenePage, opensOnBeforeState, splitIntoScenes } from "./scenes";
import type {
	CodeSnapshot,
	DiffHunk,
	DiffStepMode,
	GenerateSnapshotsOptions,
	ParsedDiff,
} from "./types";
import { type FileWindowPlan, planWindows, renderWindowedStage } from "./windowing";

/** Lines as they appear in the OLD file: context + removed (additions dropped). */
function hunkBefore(hunk: DiffHunk): string[] {
	return hunk.lines.filter((l) => l.type !== "add").map((l) => l.content);
}

/** Lines as they appear in the NEW file: context + added (removals dropped). */
function hunkAfter(hunk: DiffHunk): string[] {
	return hunk.lines.filter((l) => l.type !== "remove").map((l) => l.content);
}

/**
 * Reconstruct the code shown at a given stage. Hunks before `appliedHunks`
 * render in their "after" state; the rest render in their "before" state.
 *
 * `appliedHunks === 0` → full old state; `appliedHunks === hunks.length` → full
 * new state.
 */
function codeAtStage(hunks: DiffHunk[], appliedHunks: number): string {
	const lines: string[] = [];
	hunks.forEach((hunk, index) => {
		lines.push(...(index < appliedHunks ? hunkAfter(hunk) : hunkBefore(hunk)));
	});
	return lines.join("\n");
}

function stageLabel(hunks: DiffHunk[], appliedHunks: number): string {
	if (appliedHunks === 0) {
		return "Before";
	}
	if (appliedHunks === hunks.length) {
		return "After";
	}
	const hunk = hunks[appliedHunks - 1];
	return hunk?.heading ? hunk.heading : `Change ${appliedHunks}`;
}

/** Append the stage-independent omission marker to a frame, if there is one. */
function appendMarker(code: string, marker: string | null): string {
	// An empty frame (e.g. the "before" of an all-additions file) is dropped by
	// normalizeSnapshots, so leave it empty rather than resurrect it as a lone marker.
	if (!marker || code === "") {
		return code;
	}
	return `${code}\n${marker}`;
}

/** Stage a `codeAt(applied)` renderer across the hunks, before-after or one per hunk. */
function buildStages(
	mode: DiffStepMode,
	hunks: DiffHunk[],
	codeAt: (applied: number) => string,
): CodeSnapshot[] {
	if (mode === "before-after") {
		return [
			{ code: codeAt(0), label: "Before" },
			{ code: codeAt(hunks.length), label: "After" },
		];
	}

	// hunk-by-hunk: one snapshot per stage, from all-before to all-after.
	const snapshots: CodeSnapshot[] = [];
	for (let applied = 0; applied <= hunks.length; applied++) {
		snapshots.push({
			code: codeAt(applied),
			label: stageLabel(hunks, applied),
		});
	}
	return snapshots;
}

/**
 * Turn a parsed diff into an ordered list of code snapshots.
 *
 * Hunks from every file are flattened in document order, so a single-file diff
 * (the common case) reads top-to-bottom and a multi-file diff walks each file's
 * changes in turn. By default each stage is *windowed*: only the code around
 * the changes renders, so real-world PRs stay readable; the windows are computed
 * once up front and reused for every stage, which keeps the magic-move morph
 * clean. Pass `windowing: false` for the legacy full-frame snapshots.
 *
 * The windowed path is also size-budgeted (see {@link budgetWalkthrough}): a huge
 * PR is capped to the first few files and ~50 code lines per frame, with a single
 * stable omission marker, so the frames stay readable and the plan build stays
 * fast. The budget is derived once from the (stage-independent) window plan and the
 * stage count follows the kept hunks, so dropped hunks never emit phantom stages.
 */
export function generateSnapshots(
	diff: ParsedDiff,
	options: GenerateSnapshotsOptions = {},
): CodeSnapshot[] {
	const mode = options.mode ?? "hunk-by-hunk";
	const windowing = options.windowing ?? true;

	if (!windowing) {
		// Legacy full-frame path (tests / back-compat): no windows, no budget.
		const hunks = diff.files.flatMap((file) => file.hunks);
		if (hunks.length === 0) {
			return [];
		}
		return buildStages(mode, hunks, (applied) => codeAtStage(hunks, applied));
	}

	// Compute the windows once, then budget them; every stage renders against the
	// same (kept, possibly truncated) boundaries and the same omission marker.
	const planned = planWindows(diff.files);
	const { plans, marker } = budgetWalkthrough(planned);
	if (plans.every((plan) => plan.hunks.length === 0)) {
		return [];
	}
	return sceneSnapshots(mode, plans, marker, planned.length);
}

/**
 * The windowed walkthrough as scenes (see ./scenes): each page plays on its own,
 * its before-state, each of its hunks applied, its after-state. A diff that fits
 * one scene is one page and comes out exactly as the unsplit walkthrough did.
 *
 * Captions across pages: the walkthrough opens on "Before" and ends on "After";
 * every other frame carries its hunk's heading, or `Change n` numbered by the
 * HUNK, so a continuation scene keeps the caption of the hunk it continues. A
 * page opens on the caption of its own first hunk: the same one when it goes on
 * with the hunk before, never the previous page's when it starts another (it may
 * be another file's). A continuation of an addition has no opening frame (see
 * {@link opensOnBeforeState}). The omission marker describes what follows the end
 * of the video, so only the last page carries it.
 */
function sceneSnapshots(
	mode: DiffStepMode,
	plans: FileWindowPlan[],
	omitted: string | null,
	totalFiles: number,
): CodeSnapshot[] {
	let marker = omitted;
	let pages = splitIntoScenes(plans, marker ? 1 : 0);
	if (pages.length > MAX_WALKTHROUGH_PAGES) {
		// The scaffold of each page (headers, separators) took the walkthrough past the
		// page cap: lay the pages out again with the marker's row free, and cut them.
		pages = splitIntoScenes(plans, 1).slice(0, MAX_WALKTHROUGH_PAGES);
		// A file whose every window sat past the cut is hidden too: count it.
		const shown = new Set(pages.flatMap((page) => page.plans.map((plan) => plan.path)));
		marker = omissionMarker(totalFiles - shown.size, true);
	}
	const showHeaders = plans.length > 1;
	const snapshots: CodeSnapshot[] = [];

	pages.forEach((page, pageIndex) => {
		const last = pageIndex === pages.length - 1;
		const hunkCount = page.hunkNumbers.length;
		const applied = mode === "before-after" ? [0, hunkCount] : range(hunkCount + 1);

		for (const count of applied) {
			if (count === 0 && !opensOnBeforeState(page, pages[pageIndex - 1])) {
				continue;
			}
			const code = renderWindowedStage(page.plans, count, showHeaders);
			snapshots.push({
				code: appendMarker(code, last ? marker : null),
				label: sceneLabel(page, count, pageIndex, last),
			});
		}
	});
	return snapshots;
}

function range(length: number): number[] {
	return Array.from({ length }, (_, index) => index);
}

/** A hunk's own caption: its heading, or `Change n` numbered by the hunk across the walkthrough. */
function hunkCaption(page: ScenePage, index: number): string {
	const hunk = page.plans.flatMap((plan) => plan.hunks)[index];
	return hunk?.heading ? hunk.heading : `Change ${(page.hunkNumbers[index] ?? index) + 1}`;
}

/** The caption of the stage that has applied the first `count` hunks of a page. */
function sceneLabel(page: ScenePage, count: number, pageIndex: number, lastPage: boolean): string {
	if (count === 0) {
		return pageIndex === 0 ? "Before" : hunkCaption(page, 0);
	}
	if (lastPage && count === page.hunkNumbers.length) {
		return "After";
	}
	return hunkCaption(page, count - 1);
}

/**
 * Prepare raw snapshots for animation: drop frames that are empty (e.g. the
 * "before" of a brand-new file, which a domain {@link Step} can't hold) and
 * collapse consecutive duplicates so no step morphs into an identical frame.
 */
export function normalizeSnapshots(snapshots: CodeSnapshot[]): CodeSnapshot[] {
	const result: CodeSnapshot[] = [];
	for (const snapshot of snapshots) {
		if (snapshot.code.trim() === "") {
			continue;
		}
		if (result[result.length - 1]?.code === snapshot.code) {
			continue;
		}
		result.push(snapshot);
	}
	return result;
}
