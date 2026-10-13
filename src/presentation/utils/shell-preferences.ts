/**
 * What the shell remembers about itself.
 *
 * One thing so far: whether the code card was folded away. It is deliberately
 * NOT part of the draft. The draft is the project payload a JSON export writes
 * and a share link carries, and how somebody arranged their own window is not
 * something a link should hand to whoever opens it. So the choice travels in a
 * key of its own, beside the draft rather than inside it.
 *
 * The default is Preview: the video is the object being made and the editor is
 * one intentional action away. A remembered choice still wins on return.
 */

export const SHELL_STORAGE_KEY = "typelapse:shell";

export interface ShellPreferences {
	codeFolded: boolean;
}

export const DEFAULT_SHELL_PREFERENCES: ShellPreferences = { codeFolded: true };

export function parseShellPreferences(raw: string | null): ShellPreferences {
	if (raw === null) {
		return DEFAULT_SHELL_PREFERENCES;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return DEFAULT_SHELL_PREFERENCES;
		}
		const folded = (parsed as { codeFolded?: unknown }).codeFolded;
		if (typeof folded !== "boolean") {
			return DEFAULT_SHELL_PREFERENCES;
		}
		return { codeFolded: folded };
	} catch {
		return DEFAULT_SHELL_PREFERENCES;
	}
}

/**
 * Whether the studio opens with the code folded (gate five D3): a project with
 * no scene yet opens in Edit, whatever was remembered, because Preview has no
 * path to its first scene. The choice is not stored; a project with scenes
 * opens in the mode that was.
 */
export function openingCodeFolded(sceneCount: number, remembered: boolean): boolean {
	return sceneCount === 0 ? false : remembered;
}

/**
 * How many scenes a visit will open with, judged before the studio has loaded,
 * from what it will read: the scenes of a `#share=` link, which wins, else those
 * of the stored draft. A first visit has neither, and a draft that cannot be
 * read is set aside by the studio, which then opens the default project: none.
 * The loading outline draws the mode this chooses (#270).
 */
export function scenesBeforeBoot({
	shared,
	draft,
}: {
	shared: { steps?: readonly unknown[] } | null;
	draft: string | null;
}): number {
	if (shared) {
		return shared.steps?.length ?? 0;
	}
	if (draft === null) {
		return 0;
	}
	try {
		const steps = (JSON.parse(draft) as { steps?: unknown }).steps;
		return Array.isArray(steps) ? steps.length : 0;
	} catch {
		return 0;
	}
}

export function readShellPreferences(): ShellPreferences {
	try {
		return parseShellPreferences(window.localStorage.getItem(SHELL_STORAGE_KEY));
	} catch {
		// Private mode or blocked storage: the shell still works, just amnesiac.
		return DEFAULT_SHELL_PREFERENCES;
	}
}

export function writeShellPreferences(preferences: ShellPreferences): void {
	try {
		window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(preferences));
	} catch {
		// A preference we cannot store is a preference we do not promise to keep.
	}
}
