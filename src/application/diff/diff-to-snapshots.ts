import { languageFromPath } from "@/application/language/language-from-filename";
import { parseUnifiedDiff } from "./parse-unified-diff";
import { generateSnapshots, normalizeSnapshots } from "./snapshots";
import { MAX_DIFF_STEPS } from "./step-cap";
import type { DiffFile, DiffHunk, DiffToSnapshotsOptions, DiffToSnapshotsResult } from "./types";
import { ELLIPSIS, filterLockfiles } from "./windowing";

const NO_NEWLINE_MARKER = /^\\ No newline at end of file/m;

function sideOf(hunk: DiffHunk, dropped: "add" | "remove"): string {
	return hunk.lines
		.filter((line) => line.type !== dropped)
		.map((line) => line.content)
		.join("\n");
}

/**
 * True when no hunk changes a visible character: the parser reads lines
 * without their terminators, so a diff that only adds or drops the final
 * newline, or swaps CRLF for LF, has identical sides once parsed.
 */
export function changesOnlyLineEndings(files: readonly DiffFile[]): boolean {
	return files.every((file) =>
		file.hunks.every((hunk) => sideOf(hunk, "add") === sideOf(hunk, "remove")),
	);
}

/** The caption of the frame a delete-only diff ends on. */
function removalCaption(files: readonly DiffFile[], path: string | undefined): string {
	return files.length === 1 && path ? `${path} removed` : `${files.length} files removed`;
}

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
	// Lockfiles are generated noise: drop them unless they're all the diff has.
	const files = filterLockfiles(parsed.files);
	const hunkCount = files.reduce((sum, file) => sum + file.hunks.length, 0);
	if (hunkCount === 0) {
		// A real git diff can still carry no text hunks: only binary files, pure
		// renames or mode changes. Telling that user to paste `git diff` output,
		// which is exactly what they pasted, sends them in a circle.
		// The parser keeps only files with hunks, so git's own per-file header is
		// the evidence that a real diff was pasted.
		throw new Error(
			/^diff --git /m.test(diffText)
				? "This diff only changes binary files, renames or modes: there is no code to animate."
				: "No diff hunks found: paste the output of `git diff`.",
		);
	}

	if (changesOnlyLineEndings(files)) {
		throw new Error(
			NO_NEWLINE_MARKER.test(diffText)
				? "This diff only changes the newline at the end of the file: there is nothing to animate."
				: "This diff only changes line endings: there is nothing to animate.",
		);
	}

	// Windowed by default (readable on real PRs); options can force full frames.
	const stage = (reserveMarkerRow: boolean) =>
		normalizeSnapshots(
			generateSnapshots(
				{ files },
				{ mode: options.mode, windowing: options.windowing, reserveMarkerRow },
			),
		);
	let snapshots = stage(options.reserveMarkerRow === true);
	// A walkthrough past the step cap ends on the cap's marker row, which is added
	// after the paging: lay the pages out again with that row free, so no frame
	// grows past a scene.
	if (options.reserveMarkerRow === undefined && snapshots.length > MAX_DIFF_STEPS) {
		snapshots = stage(true);
	}
	if (snapshots.length === 0) {
		throw new Error("The diff contains no changes to animate.");
	}

	const primary = files.find((file) => file.hunks.length > 0);
	const path = primary?.newPath ?? primary?.oldPath ?? undefined;

	// A diff that only deletes files would end on the file as it was, with
	// nothing saying it went away. It plays as two scenes instead: the file,
	// then a frame that says what happened. A step cannot hold empty code, so
	// that frame holds the same omission mark the windowed frames use.
	const deletesOnly = files.every((file) => file.isDeleted);
	const first = snapshots[0];
	const told =
		deletesOnly && first
			? [first, { code: ELLIPSIS, label: removalCaption(files, path) }]
			: snapshots;

	return {
		snapshots: told,
		language: languageFromPath(path),
		path,
		fileCount: files.length,
		removesOnly: deletesOnly,
	};
}
