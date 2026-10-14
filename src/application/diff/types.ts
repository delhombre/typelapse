/**
 * Types for turning a unified diff into an ordered sequence of code snapshots.
 *
 * This layer is pure: it never imports from `presentation` or `infrastructure`,
 * and it has no framework dependencies. A snapshot is just code + a label; the
 * presentation layer maps snapshots onto domain {@link Step}s and hands them to
 * the Magic Move engine so the preview animates the change token-by-token.
 */

export type DiffLineType = "context" | "add" | "remove";

/** A single line inside a hunk, with its marker char already stripped. */
export interface DiffLine {
	type: DiffLineType;
	content: string;
}

/** One `@@ ... @@` block: a contiguous window of change plus surrounding context. */
export interface DiffHunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	/** The section heading git prints after the second `@@` (often a function name). */
	heading: string;
	lines: DiffLine[];
}

/** All hunks that belong to a single file in the diff. */
export interface DiffFile {
	/** Source path, or `null` when the file is newly created (`/dev/null`). */
	oldPath: string | null;
	/** Target path, or `null` when the file is deleted (`/dev/null`). */
	newPath: string | null;
	isNew: boolean;
	isDeleted: boolean;
	hunks: DiffHunk[];
}

export interface ParsedDiff {
	files: DiffFile[];
}

/** A single frame of the animation: the code shown at one step. */
export interface CodeSnapshot {
	code: string;
	label?: string;
	/**
	 * A scene break: this frame opens a new page or a new chapter, so it shares
	 * nothing with the frame before it and no token may glide across the pair.
	 * Absent inside a page, and never on the first frame.
	 */
	sceneBreak?: true;
}

/**
 * - `before-after`: two frames, the full old state, then the full new state.
 * - `hunk-by-hunk`: one extra frame per hunk, applying a single hunk at a time
 *   so the walkthrough morphs the change region-by-region (the default).
 */
export type DiffStepMode = "before-after" | "hunk-by-hunk";

export interface GenerateSnapshotsOptions {
	mode?: DiffStepMode;
	/**
	 * Show only windows of code around each change (± context lines) with `⋯`
	 * separators, GitHub-style, instead of every hunked line. Defaults to `true`;
	 * pass `false` for the legacy full-frame snapshots (tests / back-compat).
	 */
	windowing?: boolean;
	/**
	 * Keep one row of every page free for the step cap's marker (see
	 * {@link ./step-cap}), which lands on the last kept step after the paging. Set
	 * when the walkthrough will be cut; a page the budget already marks has that
	 * row reserved either way.
	 */
	reserveMarkerRow?: boolean;
}

export interface DiffToSnapshotsOptions {
	mode?: DiffStepMode;
	/** See {@link GenerateSnapshotsOptions.windowing}. Defaults to `true`. */
	windowing?: boolean;
	/**
	 * See {@link GenerateSnapshotsOptions.reserveMarkerRow}. Left unset, a diff
	 * that stages more than the step cap reserves it by itself.
	 */
	reserveMarkerRow?: boolean;
}

export interface DiffToSnapshotsResult {
	snapshots: CodeSnapshot[];
	/** Inferred Shiki language id from the changed file's extension, if recognised. */
	language?: string;
	/** The primary changed file's path, if the diff carried one. */
	path?: string;
	/** How many files the diff touched. */
	fileCount: number;
	/** True when every file was deleted: the snapshots end on the removal frame. */
	removesOnly: boolean;
}
