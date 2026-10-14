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
 * ## Scene breaks
 *
 * Chapter boundaries are usually scene breaks: consecutive chapters window different
 * hunks, so their frames share little structure, and a token-by-token morph
 * between them sends letters flying across lines (#280). The first frame of
 * every chapter after the first carries `sceneBreak`, as the first frame of a
 * page does inside one diff, unless the chapter's before-state is the code on
 * screen (two commits on the same lines): that first frame is a direct edit and
 * morphs. Both keyers match no token across a break: the old frame fades out and
 * the new one fades in. Token stability only holds WITHIN a
 * page (the shared windows in {@link generateSnapshots}), never across a break.
 *
 * The module is pure: it composes sibling diff modules and has no framework deps.
 */

import { changesOnlyLineEndings, diffToSnapshots } from "./diff-to-snapshots";
import { parseUnifiedDiff } from "./parse-unified-diff";
import { MAX_DIFF_STEPS } from "./step-cap";
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
 * Several commit chapters as one snapshot sequence per kept chapter, in order:
 * run each through {@link diffToSnapshots}, drop the redundant leading
 * before-frame of every chapter after the first, and rehead each chapter's
 * opening frame with its `k/N · subject` label. Lockfiles-only and empty chapters
 * are skipped. The sequences stay apart so a cap can keep whole chapters.
 */
export function chapterSequences(
	chapters: DiffChapter[],
	{ maxSteps = MAX_DIFF_STEPS, ...options }: ChapterOptions = {},
): CodeSnapshot[][] {
	const real = chapters.filter((chapter) => hasRealChanges(chapter.diffText));
	const stage = (opts: DiffToSnapshotsOptions) =>
		real.map((chapter) => ({
			title: chapter.title,
			...pick(diffToSnapshots(chapter.diffText, opts)),
		}));
	let kept = stage(options);
	// Past the step cap the walkthrough ends on the cap's marker row, which lands
	// after the paging: stage every chapter again with that row free.
	if (
		options.reserveMarkerRow === undefined &&
		kept.reduce((sum, chapter) => sum + chapter.snapshots.length, 0) > maxSteps
	) {
		kept = stage({ ...options, reserveMarkerRow: true });
	}

	const total = kept.length;
	// The code the previous chapter ends on: what is on screen when the next opens.
	let onScreen: string | undefined;

	return kept.map((chapter, index) => {
		const position = index + 1;
		let frames = chapter.snapshots;
		// A chapter whose before-state is the code on screen edits it directly: its
		// first frame morphs. Any other chapter opens on a scene break.
		const before = frames[0]?.label === BEFORE_LABEL ? frames[0].code : undefined;
		const opensScene = position > 1 && (before === undefined || before !== onScreen);
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
		const [opening, ...rest] = frames;
		if (!opening) {
			return frames;
		}
		const label =
			chapter.title === "" ? opening.label : chapterHeading(position, total, chapter.title);
		const sequence: CodeSnapshot[] = [
			{
				code: opening.code,
				...(label !== undefined ? { label } : {}),
				...(opensScene ? { sceneBreak: true as const } : {}),
			},
			...rest,
		];
		onScreen = sequence.at(-1)?.code;
		return sequence;
	});
}

/** What chaptering may be told: the diff options, and the steps the walkthrough may play. */
export interface ChapterOptions extends DiffToSnapshotsOptions {
	/** The cap the sequences will meet (default {@link MAX_DIFF_STEPS}); see {@link stepBudget}. */
	maxSteps?: number;
}

/** The chapters of {@link chapterSequences} played one after the other. */
export function chapterSnapshots(
	chapters: DiffChapter[],
	options: DiffToSnapshotsOptions = {},
): CodeSnapshot[] {
	return chapterSequences(chapters, options).flat();
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
