/**
 * Fetch a GitHub release (or a compare range) as chapters, one per commit, plus
 * the card it opens on. A release is the range from the tag before it, in the
 * repository's tag order, to its own tag; the first tag runs from the first
 * commit. Each commit's diff is then fetched one after another, as a chaptered
 * pull request is, through the same GitHub helpers and the same sentences.
 * A range past what a video chapters plays as one change instead: the range's
 * own diff, in a single untitled chapter, said in a notice.
 *
 * Merge commits are left out: a merge repeats the commits it brings in, which
 * the range already lists one by one.
 */

import type { DiffChapter } from "@/application/diff";
import { type CompareRef, type ReleaseRef, isSafeGitRef } from "@/application/import/pr-url";
import { type ReleaseCard, releaseCardText } from "@/application/import/release-project";
import {
	type ChapterProgress,
	type GitHubRead,
	MAX_CHAPTER_COMMITS,
	RateLimitError,
	commitApiUrl,
	fetchDiff,
	fetchJson,
	fetchJsonStrict,
} from "./pr-import";

/**
 * A release split into one chapter per commit, plus what its title card says.
 * Past {@link MAX_CHAPTER_COMMITS} commits, one untitled chapter of the whole range.
 */
export interface ReleaseWalkthrough {
	card: ReleaseCard;
	chapters: DiffChapter[];
	/** Said alongside a good import: the range is not shown the way a release usually is. */
	notice?: string;
}

/** GitHub's largest page of tags. */
const TAG_PAGE_SIZE = 100;

/** A tag further down than this many pages is past what a release page links. */
const MAX_TAG_PAGES = 10;

const RELEASE_NOT_FOUND = "Release not found";

const TOO_LARGE = "GitHub will not compare a range this large: pass a smaller range";

interface GitHubCommit {
	sha: string;
	commit?: { message?: string };
	parents?: unknown[];
}

interface GitHubRelease {
	name?: string | null;
	body?: string | null;
}

function repoApi(ref: { owner: string; repo: string }): string {
	return `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

/**
 * A ref in a URL path: each part escaped, the slashes of `release/2.0` kept. A ref
 * git would refuse (a `.` or `..` part, a backslash) is refused before any request:
 * fetch folds dot segments out of a path, so one could aim the call at another
 * repository than the one the caller's public-only guard checked.
 */
function pathRef(ref: string): string {
	if (!isSafeGitRef(ref)) {
		throw new Error("That ref is not a valid git ref");
	}
	return ref.split("/").map(encodeURIComponent).join("/");
}

function isRelease(ref: ReleaseRef | CompareRef): ref is ReleaseRef {
	return "tag" in ref;
}

/**
 * The tag listed after `ref.tag` in the repository's tag order, null when it is
 * the last one (the repository's first tag). Throws "not found" when the tag is
 * not in the list at all.
 */
async function previousTag(ref: ReleaseRef, read?: GitHubRead): Promise<string | null> {
	const page = async (n: number) => {
		const tags = await fetchJsonStrict<{ name: string }[]>(
			`${repoApi(ref)}/tags?per_page=${TAG_PAGE_SIZE}&page=${n}`,
			RELEASE_NOT_FOUND,
			undefined,
			read,
		);
		return Array.isArray(tags) ? tags : [];
	};
	for (let n = 1; n <= MAX_TAG_PAGES; n += 1) {
		const tags = await page(n);
		const at = tags.findIndex((tag) => tag.name === ref.tag);
		if (at >= 0) {
			const next = tags[at + 1];
			if (next) {
				return next.name;
			}
			// The tag closes a full page: the one before it opens the next page.
			return tags.length === TAG_PAGE_SIZE ? ((await page(n + 1))[0]?.name ?? null) : null;
		}
		if (tags.length < TAG_PAGE_SIZE) {
			break;
		}
	}
	throw new Error(`${RELEASE_NOT_FOUND} (or the repository is private)`);
}

const isMerge = (commit: GitHubCommit) => (commit.parents?.length ?? 0) > 1;

/** What a range plays as: its chapters, and the notice when it is not by commit. */
type RangeWalkthrough = Pick<ReleaseWalkthrough, "chapters" | "notice">;

/**
 * The range from `base` to `head`, one chapter per commit, oldest first, merges
 * left out. Past {@link MAX_CHAPTER_COMMITS} commits it is the range's own diff
 * in one untitled chapter instead: a release workflow that failed here would
 * leave the release with no video at all, and one request is gentler on the
 * rate limit than thirty.
 */
async function rangeWalkthrough(
	ref: { owner: string; repo: string },
	base: string,
	head: string,
	what: string,
	onProgress?: ChapterProgress,
	read?: GitHubRead,
): Promise<RangeWalkthrough> {
	const url = `${repoApi(ref)}/compare/${pathRef(base)}...${pathRef(head)}`;
	const notFound = what === "release" ? RELEASE_NOT_FOUND : "Comparison not found";
	const compare = await fetchJsonStrict<{ total_commits?: number; commits?: GitHubCommit[] }>(
		url,
		notFound,
		TOO_LARGE,
		read,
	);
	const listed = compare.commits ?? [];
	// GitHub lists at most 250 commits of a range; the rest only count.
	const unlisted = Math.max(0, (compare.total_commits ?? 0) - listed.length);
	const commits = listed.filter((commit) => !isMerge(commit));
	if (commits.length + unlisted <= MAX_CHAPTER_COMMITS) {
		return { chapters: await chaptersOf(ref, commits, what, onProgress, read) };
	}
	const diffText = await fetchDiff(url, notFound, TOO_LARGE, read);
	// GitHub's own count, merges included: the number the release page shows.
	const count = compare.total_commits ?? commits.length + unlisted;
	return {
		chapters: [{ title: "", diffText }],
		notice: `${count} commits, shown as one change`,
	};
}

/** Every commit up to `tag`, oldest first, merges left out: the first tag's range. */
async function historyCommits(ref: ReleaseRef, read?: GitHubRead): Promise<GitHubCommit[]> {
	const listed = await fetchJsonStrict<GitHubCommit[]>(
		`${repoApi(ref)}/commits?sha=${encodeURIComponent(ref.tag)}&per_page=${MAX_CHAPTER_COMMITS + 1}`,
		RELEASE_NOT_FOUND,
		undefined,
		read,
	);
	// A full page means the history goes on past it. With no tag before it there
	// is no range to diff as one change, so the way out is a range of one's own.
	if (listed.length > MAX_CHAPTER_COMMITS) {
		throw new Error(
			`${ref.tag} is the first tag and its history runs past ${MAX_CHAPTER_COMMITS} commits, with no tag before it to compare with: pass a compare link`,
		);
	}
	return listed.filter((commit) => !isMerge(commit)).reverse();
}

/** Each commit's diff, in order and one at a time, which is gentler on the rate limit. */
async function chaptersOf(
	ref: { owner: string; repo: string },
	commits: GitHubCommit[],
	what: string,
	onProgress?: ChapterProgress,
	read?: GitHubRead,
): Promise<DiffChapter[]> {
	if (commits.length === 0) {
		throw new Error(`This ${what} has no commits to chapter`);
	}
	const chapters: DiffChapter[] = [];
	for (const commit of commits) {
		const diffText = await fetchDiff(
			commitApiUrl(ref.owner, ref.repo, commit.sha),
			"Commit not found",
			undefined,
			read,
		);
		const subject = commit.commit?.message?.split("\n")[0]?.trim();
		chapters.push({ title: subject || commit.sha.slice(0, 7), diffText });
		onProgress?.(chapters.length, commits.length);
	}
	return chapters;
}

/**
 * A release or a compare range → its title card and one chapter per commit, or
 * the whole range as one change past {@link MAX_CHAPTER_COMMITS} commits.
 * `onProgress` reports `commit k/N` while the diffs arrive. Every failure is
 * one sentence: missing or private, the rate limit, a range GitHub will not
 * compare, a first tag with too long a history.
 */
export async function fetchReleaseChapters(
	ref: ReleaseRef | CompareRef,
	onProgress?: ChapterProgress,
	read?: GitHubRead,
): Promise<ReleaseWalkthrough> {
	try {
		if (!isRelease(ref)) {
			return {
				card: { title: `${ref.base}...${ref.head}` },
				...(await rangeWalkthrough(ref, ref.base, ref.head, "comparison", onProgress, read)),
			};
		}
		// A bare tag has no release: the card falls back to the tag's own name.
		const [release, previous] = await Promise.all([
			fetchJson<GitHubRelease>(`${repoApi(ref)}/releases/tags/${pathRef(ref.tag)}`, read),
			previousTag(ref, read),
		]);
		const card = releaseCardText({ name: release?.name, tag: ref.tag, body: release?.body });
		if (previous) {
			return {
				card,
				...(await rangeWalkthrough(ref, previous, ref.tag, "release", onProgress, read)),
			};
		}
		return {
			card,
			chapters: await chaptersOf(ref, await historyCommits(ref, read), "release", onProgress, read),
			notice: `${ref.tag} is the first tag, so the video runs from the first commit`,
		};
	} catch (err) {
		// The pull request's way out ("paste the diff") is no answer to a release.
		if (err instanceof RateLimitError) {
			throw err.withAdvice("try again later");
		}
		throw err;
	}
}
