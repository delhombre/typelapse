/**
 * The importers a server reads GitHub with: the studio's own, plus an optional
 * token and the public-only rule that goes with it.
 *
 * Without a token a read is what anyone can read, so a private repository
 * answers 404 by construction. With one, GitHub would answer for whatever the
 * token can see, so the rule is kept here and not left to the token's scope
 * (which the operator may have set wider than meant): before a repository is
 * read with the token, its own record must say it is public. Anything else is
 * refused in the words a missing repository gets, so a refusal does not confirm
 * that a private repository exists.
 */

import type { ImportFetchers, ImportRead } from "@/application/import/import-source";
import { type GitHubRead, fetchCommitDiff, fetchJsonStrict, fetchPrWalkthrough } from "./pr-import";
import { fetchReleaseChapters } from "./release-import";

export interface GitHubFetchersOptions {
	/** Read-only; meant to be a fine-grained token limited to public repositories. */
	readonly token?: string;
}

interface Repository {
	readonly private?: boolean;
}

async function requirePublic(
	repository: { owner: string; repo: string },
	notFound: string,
	read: GitHubRead,
): Promise<void> {
	const record = await fetchJsonStrict<Repository>(
		`https://api.github.com/repos/${repository.owner}/${repository.repo}`,
		notFound,
		undefined,
		read,
	);
	// Only a repository that says it is public is read: an absent field is not a yes.
	if (record.private !== false) {
		throw new Error(`${notFound} (or the repository is private)`);
	}
}

export function createGitHubFetchers(options: GitHubFetchersOptions = {}): ImportFetchers {
	const { token } = options;
	const readOf = (read?: ImportRead): GitHubRead => ({
		...(token ? { token } : {}),
		...(read?.signal ? { signal: read.signal } : {}),
	});
	// One request more per source, and only for a read that carries the token.
	const guarded = async <T>(
		repository: { owner: string; repo: string },
		notFound: string,
		read: GitHubRead,
		fetch: () => Promise<T>,
	): Promise<T> => {
		if (token) {
			await requirePublic(repository, notFound, read);
		}
		return fetch();
	};
	return {
		fetchPr: (ref, read) =>
			guarded(ref, "PR not found", readOf(read), () => fetchPrWalkthrough(ref, readOf(read))),
		fetchCommit: (ref, read) =>
			guarded(ref, "Commit not found", readOf(read), () => fetchCommitDiff(ref, readOf(read))),
		fetchRelease: (ref, read) =>
			guarded(ref, "tag" in ref ? "Release not found" : "Comparison not found", readOf(read), () =>
				fetchReleaseChapters(ref, undefined, readOf(read)),
			),
	};
}
