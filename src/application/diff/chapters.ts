/**
 * Multi-commit chaptering: turn a pull request (a stack of commits) into one
 * walkthrough where each commit is a chapter, played in order.
 *
 * Each chapter's diff runs through the EXISTING {@link diffToSnapshots} pipeline
 * (windowed, lockfile-filtered), then the per-chapter sequences concatenate into
 * a single ordered list of snapshots:
 *
 *  - The first snapshot of chapter k is reheaded `k/N · <subject>` (the commit
 *    subject, truncated). Every other snapshot keeps its own hunk label, so the
 *    captions downstream read "chapter, change, change, ... , next chapter".
 *  - Every chapter after the first drops its redundant leading "Before" frame:
 *    chapter k's before-state is chapter k-1's after-state in spirit. Within one
 *    diff {@link normalizeSnapshots} already collapses consecutive duplicates, but
 *    across chapters the windows differ, so the redundant before-frame is not a
 *    byte-identical duplicate and must be dropped explicitly to keep it tight.
 *  - A chapter whose diff is lockfiles-only or empty carries no changes to
 *    animate and is skipped entirely; N counts only the kept chapters.
 *
 * ## Morph note
 *
 * Chapter boundaries are scene changes: consecutive chapters window different
 * hunks, so their frames share little structure and the Magic Move engine simply
 * cross-fades the pair. That is fine, the engine handles arbitrary frame pairs;
 * the token-stability requirement only holds WITHIN a chapter (already guaranteed
 * by the shared windows in {@link generateSnapshots}), never ACROSS chapters.
 *
 * The module is pure: it composes sibling diff modules and has no framework deps.
 */

import { changesOnlyLineEndings, diffToSnapshots } from "./diff-to-snapshots";
import { parseUnifiedDiff } from "./parse-unified-diff";
import type { CodeSnapshot, DiffToSnapshotsOptions, DiffToSnapshotsResult } from "./types";
import { isLockfile } from "./windowing";

/**
 * One commit's worth of change: its subject line and its raw unified diff. An
 * empty title is a whole change shown as one (a release past what a video
 * chapters): its frames keep their own captions, with no `k/N` heading.
 */
export interface DiffChapter {
	title: string;
	diffText: string;
}

/** The `k/N · subject` chapter heading separator (a middle dot, not an em-dash). */
const HEADING_SEPARATOR = "·";

/** Commit subjects longer than this are truncated (ellipsis included) in headings. */
const SUBJECT_MAX_LENGTH = 60;

/** The label a windowed sequence gives its full "before everything" opening frame. */
const BEFORE_LABEL = "Before";

/** Trim `subject` to at most {@link SUBJECT_MAX_LENGTH} chars, ellipsising overflow. */
function truncateSubject(subject: string): string {
	const trimmed = subject.trim();
	if (trimmed.length <= SUBJECT_MAX_LENGTH) {
		return trimmed;
	}
	return `${trimmed.slice(0, SUBJECT_MAX_LENGTH - 1).trimEnd()}…`;
}

function pick(
	result: DiffToSnapshotsResult,
): Pick<DiffToSnapshotsResult, "snapshots" | "removesOnly"> {
	return { snapshots: result.snapshots, removesOnly: result.removesOnly };
}

/** The `k/N · subject` heading that opens chapter `position` of `total`. */
function chapterHeading(position: number, total: number, subject: string): string {
	return `${position}/${total} ${HEADING_SEPARATOR} ${truncateSubject(subject)}`;
}

/**
 * True when a chapter's diff has real (non-lockfile) hunks worth animating.
 * `diffToSnapshots` keeps a lockfiles-only diff (a lockfile walkthrough beats an
 * empty import), but a chapter of pure lockfile churn is noise inside a PR, so we
 * skip it here. An empty or unparseable diff has no files and is skipped too.
 */
function hasRealChanges(diffText: string): boolean {
	const parsed = parseUnifiedDiff(diffText);
	const real = parsed.files.filter(
		(file) => !isLockfile(file.newPath ?? file.oldPath) && file.hunks.length > 0,
	);
	// A commit that only fixes the final newline is refused on its own; inside
	// a pull request it is skipped like lockfile churn, not allowed to fail it.
	return real.length > 0 && !changesOnlyLineEndings(real);
}

/**
 * Concatenate several commit chapters into one ordered snapshot sequence: run
 * each through {@link diffToSnapshots}, drop the redundant leading before-frame of
 * every chapter after the first, and rehead each chapter's opening frame with its
 * `k/N · subject` label. Lockfiles-only and empty chapters are skipped.
 */
export function chapterSnapshots(
	chapters: DiffChapter[],
	options: DiffToSnapshotsOptions = {},
): CodeSnapshot[] {
	const kept = chapters
		.filter((chapter) => hasRealChanges(chapter.diffText))
		.map((chapter) => ({
			title: chapter.title,
			...pick(diffToSnapshots(chapter.diffText, options)),
		}));

	const total = kept.length;
	const out: CodeSnapshot[] = [];

	kept.forEach((chapter, index) => {
		const position = index + 1;
		let frames = chapter.snapshots;
		// Every chapter but the first opens on a before-state the previous chapter
		// already established; drop it so the walkthrough never stalls on a rerun.
		// But a deletion/emptying commit normalizes to a LONE "Before" frame: that
		// frame IS the whole chapter, so keep it (the length guard) and let it be
		// reheaded below like any first frame, or the counted chapter would vanish.
		// A deletion's before frame is the file it removes, which no earlier
		// chapter showed: it stays.
		if (
			position > 1 &&
			!chapter.removesOnly &&
			frames.length > 1 &&
			frames[0]?.label === BEFORE_LABEL
		) {
			frames = frames.slice(1);
		}
		if (chapter.title === "") {
			out.push(...frames);
			return;
		}
		const heading = chapterHeading(position, total, chapter.title);
		frames.forEach((frame, frameIndex) => {
			out.push(frameIndex === 0 ? { code: frame.code, label: heading } : frame);
		});
	});

	return out;
}

/**
 * The Shiki language for a chaptered import: the first chapter whose primary file
 * has a recognizable extension. Reuses diffToSnapshots' own inference so chapters
 * tag their language exactly as a single-diff import would; a lockfiles-only or
 * unparseable chapter carries none, so the next one is tried.
 */
export function chapterLanguage(chapters: DiffChapter[]): string | undefined {
	for (const chapter of chapters) {
		try {
			const { language } = diffToSnapshots(chapter.diffText);
			if (language) {
				return language;
			}
		} catch {
			// No usable diff in this chapter: its language is undecidable, try the next.
		}
	}
	return undefined;
}
