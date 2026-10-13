/**
 * What changed in the studio, newest first, for the Help sheet's What's new card.
 *
 * Static on purpose: no request, no account. An entry is written when the change
 * ships; its id is permanent, because a person's dismissal is stored under it.
 */

export interface ChangelogEntry {
	/** Permanent. Dismissals are kept under it, so it is never reused or renamed. */
	readonly id: string;
	/** The day it shipped, `YYYY-MM-DD`. */
	readonly date: string;
	/** One line. */
	readonly title: string;
	/** One sentence. */
	readonly summary: string;
}

export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
	{
		id: "help-sheet",
		date: "2026-10-13",
		title: "A help sheet",
		summary: "Scenes, focus ranges and keyboard shortcuts are explained in the studio, under Help.",
	},
	{
		id: "first-video-card",
		date: "2026-10-13",
		title: "A First video card",
		summary:
			"A new project shows three steps to a first video, only the next one at a time, and Later puts it away for good.",
	},
	{
		id: "paid-side-under-where",
		date: "2026-10-13",
		title: "The paid side is visible under Where",
		summary:
			"On a hosted build, Export lists Cloud next to your device, and asks you to sign in or upgrade only when you press it.",
	},
	{
		id: "readable-scenes-from-a-pr",
		date: "2026-10-13",
		title: "Readable scenes from a pull request",
		summary:
			"A diff import splits a long change into scenes short enough that the code stays readable in the video.",
	},
	{
		id: "device-exports-free",
		date: "2026-10-13",
		title: "Device exports are free and unlimited",
		summary:
			"No plan limits the resolution, frame rate or length of an export that runs on your machine, and no plan adds a watermark.",
	},
];

/** The shortest list the What's new card shows. */
export const WHATS_NEW_COUNT = 3;

/**
 * The `count` newest entries, newest first. Entries on one day keep the order they
 * are written in, so the file's own order breaks the tie.
 */
export function latestEntries(
	entries: readonly ChangelogEntry[],
	count: number,
): readonly ChangelogEntry[] {
	return [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, Math.max(0, count));
}

/** The entries of `shown` that a person has not dismissed. */
export function undismissedEntries(
	shown: readonly ChangelogEntry[],
	dismissed: ReadonlySet<string>,
): readonly ChangelogEntry[] {
	return shown.filter((entry) => !dismissed.has(entry.id));
}
