import { budgetWalkthrough } from "./budget";
import type {
	CodeSnapshot,
	DiffHunk,
	DiffStepMode,
	GenerateSnapshotsOptions,
	ParsedDiff,
} from "./types";
import { planWindows, renderWindowedStage } from "./windowing";

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
	const { plans, marker } = budgetWalkthrough(planWindows(diff.files));
	const hunks = plans.flatMap((plan) => plan.hunks);
	if (hunks.length === 0) {
		return [];
	}
	return buildStages(mode, hunks, (applied) =>
		appendMarker(renderWindowedStage(plans, applied), marker),
	);
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
