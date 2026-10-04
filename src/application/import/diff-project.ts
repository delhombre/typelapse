/**
 * A unified diff → the project file the studio would save after importing it.
 *
 * The studio's diff import lives in the snippet store, which needs a browser to
 * load. The headless CLI needs the same answer without one, so the part of that
 * import that decides what the project contains lives here, pure, and the store
 * shares its step cap and hold. `tests/application/diff-project.test.ts` holds
 * the two to the same output: a CLI render of a pull request is only "the file
 * the studio would make" while that test passes.
 */

import { type CodeSnapshot, diffToSnapshots } from "@/application/diff";
import { DEFAULT_TRANSITION_EASING } from "@/application/magic-move/easing";
import type { ProjectPayload } from "@/application/project/project-payload";
import { captionFromGeneratedLabel } from "@/domain/entities/step";
import { Theme } from "@/domain/entities/theme";

/** Per-step hold applied to each step generated from a diff. */
export const DIFF_STEP_DURATION = 1200;

/** Upper bound on diff-generated steps so a pathological diff can't explode playback. */
export const MAX_DIFF_STEPS = 40;

/**
 * Cap diff snapshots at {@link MAX_DIFF_STEPS}, always keeping the final "after"
 * frame so the walkthrough still ends on the complete change (only pathologically
 * large diffs are ever trimmed).
 */
export function capDiffSnapshots(snapshots: CodeSnapshot[]): CodeSnapshot[] {
	if (snapshots.length <= MAX_DIFF_STEPS) {
		return snapshots;
	}
	const last = snapshots[snapshots.length - 1];
	const head = snapshots.slice(0, MAX_DIFF_STEPS - 1);
	return last ? [...head, last] : head;
}

/**
 * The project a fresh studio holds after importing `diffText`: its default
 * look, the diff's staged snapshots as captioned steps, and the changed file's
 * name as the title unless the caller has a better one (a PR or commit title).
 * Throws the importer's own user-facing message on an unusable diff.
 */
export function projectFromDiff(diffText: string, meta: { title?: string } = {}): ProjectPayload {
	const { snapshots, language, path } = diffToSnapshots(diffText);
	return projectFromSnapshots(snapshots, {
		title: meta.title || path?.split("/").pop() || "Untitled",
		language,
	});
}

/**
 * Staged snapshots → the project a fresh studio holds, capped and captioned the
 * way the store's diff import builds it. `openingCardMs` puts a blank step
 * first, the title card a release opens on (the store's `importChapters` takes
 * the same option, and a test holds the two to the same file).
 */
export function projectFromSnapshots(
	snapshots: CodeSnapshot[],
	meta: { title: string; language?: string; openingCardMs?: number },
): ProjectPayload {
	const staged = capDiffSnapshots(snapshots);
	const theme = Theme.midnight();
	const steps = staged.map((snapshot) => {
		const caption = captionFromGeneratedLabel(snapshot.label);
		return caption
			? { code: snapshot.code, duration: DIFF_STEP_DURATION, caption }
			: { code: snapshot.code, duration: DIFF_STEP_DURATION };
	});
	if (meta.openingCardMs !== undefined) {
		steps.unshift({ code: "", duration: meta.openingCardMs });
	}
	return {
		title: meta.title,
		code: staged[0]?.code ?? "",
		language: meta.language ?? "typescript",
		themeName: theme.name,
		fontFamily: theme.fontFamily,
		borderRadius: theme.borderRadius,
		background: "mesh:solar",
		windowChrome: "macos",
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		watermark: "",
		steps,
		progressStyle: "reels",
		typewriter: false,
		focusZoom: false,
		transitionMs: 650,
		transitionEasing: DEFAULT_TRANSITION_EASING,
		width: 1920,
		height: 1080,
		// No fps: the studio writes one only when it differs from its default of 60.
	};
}
