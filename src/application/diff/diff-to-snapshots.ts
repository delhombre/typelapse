import { languageFromPath } from "@/application/language/language-from-filename";
import { parseUnifiedDiff } from "./parse-unified-diff";
import { generateSnapshots, normalizeSnapshots } from "./snapshots";
import type { DiffToSnapshotsOptions, DiffToSnapshotsResult } from "./types";
import { filterLockfiles } from "./windowing";

/**
 * The application use-case: turn pasted unified-diff text into an animatable
 * sequence of code snapshots, plus the metadata the store needs to set up the
 * snippet (inferred language, primary path, file count).
 *
 * Throws a user-facing `Error` when the input isn't a usable diff, so the UI
 * can surface the message directly.
 */
export function diffToSnapshots(
	diffText: string,
	options: DiffToSnapshotsOptions = {},
): DiffToSnapshotsResult {
	if (diffText.trim() === "") {
		throw new Error("Paste a diff first.");
	}

	const parsed = parseUnifiedDiff(diffText);
	// Lockfiles are generated noise — drop them unless they're all the diff has.
	const files = filterLockfiles(parsed.files);
	const hunkCount = files.reduce((sum, file) => sum + file.hunks.length, 0);
	if (hunkCount === 0) {
		throw new Error("No diff hunks found: paste the output of `git diff`.");
	}

	// Windowed by default (readable on real PRs); options can force full frames.
	const snapshots = normalizeSnapshots(
		generateSnapshots({ files }, { mode: options.mode, windowing: options.windowing }),
	);
	if (snapshots.length === 0) {
		throw new Error("The diff contains no changes to animate.");
	}

	const primary = files.find((file) => file.hunks.length > 0);
	const path = primary?.newPath ?? primary?.oldPath ?? undefined;

	return {
		snapshots,
		language: languageFromPath(path),
		path,
		fileCount: files.length,
	};
}
