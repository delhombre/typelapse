/**
 * What the shell remembers about itself.
 *
 * One thing so far: whether the code card was folded away. It is deliberately
 * NOT part of the draft. The draft is the project payload a JSON export writes
 * and a share link carries, and how somebody arranged their own window is not
 * something a link should hand to whoever opens it. So the choice travels in a
 * key of its own, beside the draft rather than inside it.
 *
 * The default is open, in both directions: a stash that cannot be read is a
 * stash nobody wrote, and a studio that opens with its editor hidden on a guess
 * is a studio that lost its editor.
 */

export const SHELL_STORAGE_KEY = "typelapse:shell";

export interface ShellPreferences {
	codeFolded: boolean;
}

export const DEFAULT_SHELL_PREFERENCES: ShellPreferences = { codeFolded: false };

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
