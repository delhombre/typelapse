/**
 * A pasted source, read and imported: the cascade the CLI and the hosted render
 * route share, so a pull request becomes the same project wherever it is read.
 * A source is a GitHub pull request, commit, release or compare link, or a
 * unified diff. The network is injected ({@link ImportFetchers}); the studio's
 * own fetchers (`infrastructure/import`) are the real ones. They send no
 * credential unless a server gives them a token, and then they read public
 * repositories only (`github-fetchers`). A server may also hold one source's
 * read to a time budget ({@link ImportOptions}).
 *
 * Relative imports on purpose: the hosted server loads this under tsx, which
 * does not resolve the "@/" path mapping unless it starts from the repository.
 */

import { type DiffChapter, cutNotice } from "../diff";
import type { ProjectPayload } from "../project/project-payload";
import { isBareLink, looksLikeUnifiedDiff } from "./classify-source";
import { type ImportedWalkthrough, walkthroughFromDiff } from "./diff-project";
import {
	type CommitRef,
	type CompareRef,
	type PrRef,
	type ReleaseRef,
	resolveCommitUrl,
	resolveCompareUrl,
	resolvePrUrl,
	resolveReleaseUrl,
} from "./pr-url";
import { type ReleaseCard, releaseWalkthrough } from "./release-project";

/** The sources read from GitHub, with the coordinates the fetchers need. */
export type RemoteSource =
	| { readonly kind: "pr"; readonly ref: PrRef }
	| { readonly kind: "commit"; readonly ref: CommitRef }
	| { readonly kind: "release"; readonly ref: ReleaseRef }
	| { readonly kind: "compare"; readonly ref: CompareRef };

export type RemoteKind = RemoteSource["kind"];

export type ImportSource = RemoteSource | { readonly kind: "diff"; readonly text: string };

/** A pull request or a commit, as the fetchers return it: its diff and its title. */
export interface FetchedChange {
	readonly diffText: string;
	readonly title: string;
}

/** A release or a range: its title card and one chapter per commit. */
export interface FetchedRelease {
	readonly card: ReleaseCard;
	readonly chapters: DiffChapter[];
	/** Said alongside a good import: the range is not shown the way a release usually is. */
	readonly notice?: string;
}

/** What a read is told by the cascade: the signal that stops it when its budget is spent. */
export interface ImportRead {
	readonly signal?: AbortSignal;
}

export interface ImportFetchers {
	fetchPr: (ref: PrRef, read?: ImportRead) => Promise<FetchedChange>;
	fetchCommit: (ref: CommitRef, read?: ImportRead) => Promise<FetchedChange>;
	fetchRelease: (ref: ReleaseRef | CompareRef, read?: ImportRead) => Promise<FetchedRelease>;
}

export interface ImportedSource {
	readonly kind: ImportSource["kind"];
	/** The project the studio would hold after the same import. */
	readonly project: ProjectPayload;
	/** A release's title card, drawn on the project's blank first step. */
	readonly card?: ReleaseCard;
	readonly notice?: string;
}

/** The link a source names, in the order the studio's own classifier tries them. */
export function remoteSourceOf(input: string): RemoteSource | null {
	const pr = resolvePrUrl(input);
	if (pr) {
		return { kind: "pr", ref: pr };
	}
	const commit = resolveCommitUrl(input);
	if (commit) {
		return { kind: "commit", ref: commit };
	}
	const release = resolveReleaseUrl(input);
	if (release) {
		return { kind: "release", ref: release };
	}
	const compare = resolveCompareUrl(input);
	if (compare) {
		return { kind: "compare", ref: compare };
	}
	return null;
}

export type ReadImportSource =
	| { readonly outcome: "read"; readonly source: ImportSource }
	| { readonly outcome: "refused"; readonly message: string };

const EMPTY_SOURCE = "Send a pull request, commit, release or compare link, or a unified diff";
const NOT_A_CHANGE_LINK = "That link is not a GitHub pull request, commit, release or compare link";
const NEITHER = "The source is neither a GitHub link nor a unified diff";

/**
 * What a string is, when it is a source: a GitHub link or a unified diff. Never
 * fetches. The diff keeps the studio's reading of a paste (trimmed), and what
 * is neither is refused in one sentence that says what to send instead.
 */
export function readImportSource(input: string): ReadImportSource {
	const text = input.trim();
	if (text === "") {
		return { outcome: "refused", message: EMPTY_SOURCE };
	}
	const remote = remoteSourceOf(text);
	if (remote) {
		return { outcome: "read", source: remote };
	}
	if (looksLikeUnifiedDiff(text)) {
		return { outcome: "read", source: { kind: "diff", text } };
	}
	return { outcome: "refused", message: isBareLink(text) ? NOT_A_CHANGE_LINK : NEITHER };
}

export interface ImportOptions {
	/**
	 * The longest one source may take to read, in milliseconds. A server sets it so
	 * that a release of thirty commits, read one request at a time, cannot hold a
	 * connection for minutes; the CLI sets none and waits as long as GitHub does.
	 */
	readonly budgetMs?: number;
}

const budgetSentence = (budgetMs: number) => {
	const seconds = Math.round(budgetMs / 100) / 10;
	return `Reading the source took longer than ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
};

/**
 * The project a source becomes, built by the studio's own steps: a pull request
 * or a commit through its diff and title, a release or a range through its
 * chapters behind a title card, a diff as it is. Throws the importer's own
 * sentence when the source cannot be read or has nothing to animate, or the
 * budget's when the read outlasts it: the budget is kept here, once, so the
 * fetchers only have to stop when they are told to, and every way of reading a
 * source is held to it the same way.
 */
export async function importSource(
	source: ImportSource,
	fetchers: ImportFetchers,
	options: ImportOptions = {},
): Promise<ImportedSource> {
	const { budgetMs } = options;
	if (budgetMs === undefined) {
		return build(source, fetchers);
	}
	const stop = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const spent = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			// Refuse first, then stop the read: what it fails with after that is not the answer.
			reject(new Error(budgetSentence(budgetMs)));
			stop.abort();
		}, budgetMs);
	});
	const reading = build(source, fetchers, { signal: stop.signal });
	// A read that loses the race fails later, and nobody is left to hear it.
	reading.catch(() => undefined);
	try {
		return await Promise.race([reading, spent]);
	} finally {
		clearTimeout(timer);
	}
}

async function build(
	source: ImportSource,
	fetchers: ImportFetchers,
	read?: ImportRead,
): Promise<ImportedSource> {
	// A fetcher is told nothing when there is nothing to tell: the CLI's are called as they were.
	const told = read ? ([read] as const) : ([] as const);
	switch (source.kind) {
		case "pr":
		case "commit": {
			const { diffText, title } =
				source.kind === "pr"
					? await fetchers.fetchPr(source.ref, ...told)
					: await fetchers.fetchCommit(source.ref, ...told);
			return withCut(source.kind, walkthroughFromDiff(diffText, { title }));
		}
		case "release":
		case "compare": {
			const { card, chapters, notice } = await fetchers.fetchRelease(source.ref, ...told);
			return withCut(source.kind, releaseWalkthrough(card, chapters), notice, card);
		}
		case "diff":
			return withCut("diff", walkthroughFromDiff(source.text));
	}
}

/**
 * The import, said alongside: what the fetcher noted about the source, then what
 * the step cap left out, one clause each, set apart by a middle dot (the CLI keeps a notice to one line).
 */
function withCut(
	kind: ImportSource["kind"],
	{ project, cut }: ImportedWalkthrough,
	fetched?: string,
	card?: ReleaseCard,
): ImportedSource {
	const sentences = [fetched, cutNotice(cut)].filter((s): s is string => Boolean(s));
	const notice = sentences.map((s) => s.replace(/\.$/, "")).join(" · ");
	return {
		kind,
		project,
		...(card ? { card } : {}),
		...(notice ? { notice } : {}),
	};
}

/**
 * What one source is, whichever way its link is written: the pull request of a
 * repository, a commit, a release's tag, a range, a diff's text. GitHub names
 * owners and repositories without regard to case, and Git names tags with it.
 * Two sources with the same key are the same change.
 */
export function importSourceKey(source: ImportSource): string {
	const repository = (ref: { owner: string; repo: string }) =>
		`${ref.owner}/${ref.repo}`.toLowerCase();
	switch (source.kind) {
		case "pr":
			return `pr:${repository(source.ref)}#${source.ref.number}`;
		case "commit":
			return `commit:${repository(source.ref)}@${source.ref.sha.toLowerCase()}`;
		case "release":
			return `release:${repository(source.ref)}@${source.ref.tag}`;
		case "compare":
			return `compare:${repository(source.ref)}@${source.ref.base}...${source.ref.head}`;
		case "diff":
			return `diff:${source.text}`;
	}
}

/** Why a fetch or a build failed, read from the importer's sentence. */
export type ImportFailure =
	| "not-found"
	| "rate-limit"
	| "range-too-large"
	| "too-large"
	/** The whole read outlasted the time one source is given; GitHub may have been fine. */
	| "budget"
	| "timeout"
	| "unreachable"
	/** GitHub answered, with nothing the importer could use: its generic "could not fetch". */
	| "unfetchable"
	| "other";

/**
 * The importers speak to someone in the studio and carry their reason in their
 * sentence, so the order here is the contract: a range too big to compare asks
 * for a smaller range, which a smaller diff is not, and so it is read before
 * the general "too large".
 */
export function importFailureOf(message: string): ImportFailure {
	if (/took longer than/i.test(message)) {
		return "budget";
	}
	if (/not found/i.test(message)) {
		return "not-found";
	}
	if (/rate limit/i.test(message)) {
		return "rate-limit";
	}
	if (/will not compare/i.test(message)) {
		return "range-too-large";
	}
	if (/large/i.test(message)) {
		return "too-large";
	}
	if (/timed out/i.test(message)) {
		return "timeout";
	}
	if (/reach GitHub/i.test(message)) {
		return "unreachable";
	}
	if (/could not fetch/i.test(message)) {
		return "unfetchable";
	}
	return "other";
}

/**
 * What GitHub said of its limit, when the importer's sentence carries it: how
 * much was left and when it resets, or the wait asked. Read from the sentence
 * like the failure is, and undefined when GitHub said nothing.
 */
export function importFailureDetailOf(message: string): string | undefined {
	return /rate limit hit \(([^)]+)\)/i.exec(message)?.[1];
}
