import { commitsShownNotice } from "@/application/diff";
import { classifySource, isBareLink } from "@/application/import/classify-source";
import {
	resolveCommitUrl,
	resolveCompareUrl,
	resolvePrUrl,
	resolveReleaseUrl,
} from "@/application/import/pr-url";
import {
	RELEASE_CARD_MS,
	type ReleaseCard,
	releaseCardLayers,
} from "@/application/import/release-project";
import { languageFromPath } from "@/application/language/language-from-filename";
import {
	type Walkthrough,
	fetchCommitDiff,
	fetchPrChapters,
	fetchPrWalkthrough,
} from "@/infrastructure/import/pr-import";
import { fetchReleaseChapters } from "@/infrastructure/import/release-import";
import { importCodeFromUrl } from "@/infrastructure/import/url-import";
import { notify } from "@/presentation/stores/notice.store";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	holdStudioPersistence,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { whenStudioCompositionReady } from "@/presentation/utils/studio-composition-ready";
import { replaceStudioCompositionWithCode } from "@/presentation/utils/studio-project-replacement";
import { useCallback, useRef, useState } from "react";

/** How a pull request is played: one squashed change, or a chapter per commit. */
export type ImportPlayMode = "whole" | "commit";

/** Progress of a multi-commit fetch; null for every single-request import. */
export interface ImportProgress {
	done: number;
	total: number;
}

/** What a caller may ask of a run beyond the source itself. */
export interface ImportRunOptions {
	/**
	 * Capture the imported code as scene one when it arrives without any. A diff
	 * or a pull request arrives as steps already; a pasted snippet or a file
	 * arrives as code alone, which the studio shows as "0 scenes" with Play off.
	 * The landing hero asks for it, because its button says "Import & animate";
	 * a paste made inside the studio does not, since there the next move is the
	 * author's own (capture a scene, or keep editing).
	 */
	readonly openingScene?: boolean;
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
	run: (source: string, playMode?: ImportPlayMode, options?: ImportRunOptions) => Promise<boolean>;
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
 *
 * Whatever it is, it replaces the project like opening a file: the layers, the
 * media and the audio of the project it lands on go, and so does its undo
 * history. Asking first is the caller's job, before `run`.
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

	const run = useCallback(
		async (source: string, playMode: ImportPlayMode = "whole", options: ImportRunOptions = {}) => {
			if (busy.current) {
				return false;
			}
			// Reading a paste and importing it are two different jobs, and only the
			// reading may trim: a URL with a stray newline around it is still that URL.
			// What gets imported is `source`, because a snippet's whitespace is part of
			// the snippet.
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
						await replaceProject(() => {
							announceCut(store.importChapters(chapters, { title }));
						});
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

				if (kind === "release" || kind === "compare") {
					const ref = resolveReleaseUrl(trimmed) ?? resolveCompareUrl(trimmed);
					if (!ref) {
						throw new Error("That release link could not be read.");
					}
					// Always by commit: a release's whole change is a changelog, not a story.
					const { card, chapters } = await fetchReleaseChapters(ref, (done, total) =>
						setProgress({ done, total }),
					);
					await replaceProject(
						() => {
							announceCut(
								store.importChapters(chapters, {
									title: card.title,
									openingCardMs: RELEASE_CARD_MS,
								}),
							);
						},
						() => placeReleaseCard(card),
					);
					return true;
				}

				if (kind === "code-url") {
					const imported = await importCodeFromUrl(trimmed);
					await replaceProject(() => {
						store.importSnippet(imported.code, {
							title: imported.title,
							language: imported.language,
						});
						openScene();
					});
					return true;
				}

				if (kind === "diff") {
					// Throws a user-facing message on unusable input, before anything changes.
					await replaceProject(() => store.importDiff(trimmed));
					return true;
				}

				if (isBareLink(trimmed)) {
					throw new Error(
						"Typelapse can read GitHub pull requests, commits, releases and files, gists and raw code links. That link is none of them.",
					);
				}

				// The raw paste, not the trimmed one: a leading blank line, a body
				// indented because it was copied out of a method, and the trailing
				// newline every well-formed file ends with are all content. Nothing
				// downstream restores them — Snippet.create trims only to check for
				// emptiness, and the editor is bound straight to the stored code.
				await replaceProject(() => {
					store.importSnippet(source, { language: languageFromPath(store.snippet.title) });
					openScene();
				});
				return true;
			} catch (err) {
				setError(err instanceof Error ? err.message : "Could not import that.");
				return false;
			} finally {
				busy.current = false;
				setLoading(false);
				setProgress(null);
			}

			/* Inside the replacement, before the composition is built and the undo
		   history starts, so the scene is part of the imported project and an undo
		   cannot peel it back off into an empty one. */
			function openScene() {
				if (options.openingScene) {
					store.captureStep();
				}
			}

			async function applyWalkthrough(fetcher: () => Promise<Walkthrough>) {
				const { diffText, title } = await fetcher();
				await replaceProject(() => {
					store.importDiff(diffText);
					// The PR / commit title overrides the filename title importDiff inferred.
					store.setTitle(title);
				});
			}
		},
		[],
	);

	return { loading, error, progress, run, reset };
}

/**
 * Say so when a chaptered import played only the first commits: the video ends
 * early on its own marker row, and this is the same fact in words.
 */
function announceCut(cut: { shownChapters: number; totalChapters: number }): void {
	const message = commitsShownNotice(cut.shownChapters, cut.totalChapters);
	if (message) {
		notify(message);
	}
}

/**
 * Apply an import as a project replacement. It waits for the open project's
 * stored composition to be on screen first: an import that landed during the
 * boot restore was undone by it, the stored layers loaded over the new code.
 * Autosave is held while the code and the composition disagree, then the undo
 * history starts again from the imported project. `layer` adds what the code
 * alone does not carry (a release's title card) to the fresh composition,
 * before the history starts, so an undo cannot peel it off.
 */
async function replaceProject(apply: () => void, layer?: () => void): Promise<void> {
	await whenStudioCompositionReady();
	const release = holdStudioPersistence();
	try {
		apply();
		replaceStudioCompositionWithCode();
		layer?.();
	} finally {
		release();
	}
	studioHistory.reset();
}

/** The release's title and short line, as text layers on the blank scene it opens on. */
function placeReleaseCard(card: ReleaseCard): void {
	const composition = useStudioCompositionStore.getState();
	const scene = composition.value.project.scenes[0];
	if (!scene) {
		return;
	}
	composition.synchronize((project) =>
		releaseCardLayers(card, scene.id).reduce(
			(next, layer) => next.addBlock(scene.id, layer),
			project,
		),
	);
}
