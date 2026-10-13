/**
 * Which What's new entries this browser has dismissed, kept under a key of its own.
 *
 * Local only: no request, no account. It is deliberately not part of the draft,
 * so a project file or a share link never carries somebody's reading history.
 * The key holds entry ids, and an entry's id is permanent (application/changelog),
 * so a dismissal never hides a different, newer entry.
 */

export const CHANGELOG_DISMISSED_STORAGE_KEY = "typelapse:changelog-dismissed";

export function parseDismissedEntryIds(json: string | null): ReadonlySet<string> {
	if (json === null) {
		return new Set();
	}
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== "object" || parsed === null) {
			return new Set();
		}
		const value = parsed as Record<string, unknown>;
		if (value.version === 1 && Array.isArray(value.ids)) {
			return new Set(value.ids.filter((id): id is string => typeof id === "string"));
		}
	} catch {
		// A reading history may be forgotten without affecting the project.
	}
	return new Set();
}

export function readDismissedEntryIds(): ReadonlySet<string> {
	try {
		return parseDismissedEntryIds(window.localStorage.getItem(CHANGELOG_DISMISSED_STORAGE_KEY));
	} catch {
		return new Set();
	}
}

export function writeDismissedEntryIds(ids: ReadonlySet<string>): void {
	try {
		window.localStorage.setItem(
			CHANGELOG_DISMISSED_STORAGE_KEY,
			JSON.stringify({ version: 1, ids: [...ids] }),
		);
	} catch {
		// The card still goes away in this tab when storage is unavailable.
	}
}
