import type { CodeSnapshot, DiffHunk, GenerateSnapshotsOptions, ParsedDiff } from "./types";
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

/**
 * Turn a parsed diff into an ordered list of code snapshots.
 *
 * Hunks from every file are flattened in document order, so a single-file diff
 * (the common case) reads top-to-bottom and a multi-file diff walks each file's
 * changes in turn. By default each stage is *windowed* — only the code around
 * the changes renders, so real-world PRs stay readable; the windows are computed
 * once up front and reused for every stage, which keeps the magic-move morph
 * clean. Pass `windowing: false` for the legacy full-frame snapshots.
 */
export function generateSnapshots(
	diff: ParsedDiff,
	options: GenerateSnapshotsOptions = {},
): CodeSnapshot[] {
	const mode = options.mode ?? "hunk-by-hunk";
	const windowing = options.windowing ?? true;
	const hunks = diff.files.flatMap((file) => file.hunks);
	if (hunks.length === 0) {
		return [];
	}

	// Compute the windows once; every stage renders against the same boundaries.
	const plans = windowing ? planWindows(diff.files) : null;
	const codeAt = (applied: number): string => {
		if (plans) {
			return renderWindowedStage(plans, applied);
		}
		return codeAtStage(hunks, applied);
	};

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
