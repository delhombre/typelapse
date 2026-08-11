import { classifySource } from "@/application/import/classify-source";
import { resolveCommitUrl, resolvePrUrl } from "@/application/import/pr-url";
import { languageFromPath } from "@/application/language/language-from-filename";
import {
	type Walkthrough,
	fetchCommitDiff,
	fetchPrChapters,
	fetchPrWalkthrough,
} from "@/infrastructure/import/pr-import";
import { importCodeFromUrl } from "@/infrastructure/import/url-import";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useCallback, useRef, useState } from "react";

/** How a pull request is played: one squashed change, or a chapter per commit. */
export type ImportPlayMode = "whole" | "commit";

/** Progress of a multi-commit fetch; null for every single-request import. */
export interface ImportProgress {
	done: number;
	total: number;
}

export interface SourceImport {
	loading: boolean;
	error: string | null;
	progress: ImportProgress | null;
	/**
	 * Read one pasted string and load it into the studio. Resolves true when the
	 * studio changed, false when it did not — the caller uses that to decide
	 * whether to clear its field or close its popover, and reads `error` for why.
	 * Never rejects: every failure arrives as `error`.
	 */
	run: (source: string, playMode?: ImportPlayMode) => Promise<boolean>;
	reset: () => void;
}

/**
 * The one path from "a user pasted this" to "the studio is showing it".
 *
 * This cascade used to live inside `DiffImportMenu`, with the code-URL arm in a
 * second popover and no way for anything else to reach either. The landing hero
 * needs the same journey — and a hero that reimplemented it would drift from the
 * studio within a release — so it lives here and both call it.
 *
 * What each kind becomes is deliberately not uniform: a PR or a commit becomes a
 * stepped walkthrough, a code URL or a paste becomes a single frame you can then
 * build steps from. That is the existing behaviour of the studio's menus, kept.
 */
export function useSourceImport(): SourceImport {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<ImportProgress | null>(null);
	// State lags a synchronous second call; a ref does not. Without it a double
	// press fires two fetches of the same pull request.
	const busy = useRef(false);

	const reset = useCallback(() => {
		setError(null);
		setProgress(null);
	}, []);

	const run = useCallback(async (source: string, playMode: ImportPlayMode = "whole") => {
		if (busy.current) {
			return false;
		}
		const trimmed = source.trim();
		const kind = classifySource(trimmed);
		if (kind === "empty") {
			setError("Paste a pull request, a diff or some code first.");
			return false;
		}

		busy.current = true;
		setLoading(true);
		setError(null);
		setProgress(null);

		// The store is read imperatively: this hook is called from event handlers
		// and effects, and subscribing to six actions would re-render both callers
		// on every unrelated snippet change.
		const store = useSnippetStore.getState();

		try {
			if (kind === "pr") {
				// Non-null: classifySource said "pr" because this same call succeeded.
				const ref = resolvePrUrl(trimmed);
				if (!ref) {
					throw new Error("That pull-request link could not be read.");
				}
				if (playMode === "commit") {
					const { title, chapters } = await fetchPrChapters(ref, (done, total) =>
						setProgress({ done, total }),
					);
					// importChapters sets the title itself.
					store.importChapters(chapters, { title });
				} else {
					await applyWalkthrough(() => fetchPrWalkthrough(ref));
				}
				return true;
			}

			if (kind === "commit") {
				const ref = resolveCommitUrl(trimmed);
				if (!ref) {
					throw new Error("That commit link could not be read.");
				}
				await applyWalkthrough(() => fetchCommitDiff(ref));
				return true;
			}

			if (kind === "code-url") {
				const imported = await importCodeFromUrl(trimmed);
				store.importSnippet(imported.code, {
					title: imported.title,
					language: imported.language,
				});
				return true;
			}

			if (kind === "diff") {
				// Synchronous, and throws a user-facing message on unusable input.
				store.importDiff(trimmed);
				return true;
			}

			store.importSnippet(trimmed, { language: languageFromPath(store.snippet.title) });
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not import that.");
			return false;
		} finally {
			busy.current = false;
			setLoading(false);
			setProgress(null);
		}

		async function applyWalkthrough(fetcher: () => Promise<Walkthrough>) {
			const { diffText, title } = await fetcher();
			store.importDiff(diffText);
			// The PR / commit title overrides the filename title importDiff inferred.
			store.setTitle(title);
		}
	}, []);

	return { loading, error, progress, run, reset };
}
