/**
 * What the First video card remembers about this browser: it was put away
 * ("Later"), a video has finished rendering, its completion has been shown.
 *
 * A key of its own, like the shell's: how a visitor treated a hint is not part
 * of the project a JSON export or a share link carries. No account, nothing
 * sent anywhere.
 */

export const FIRST_VIDEO_STORAGE_KEY = "typelapse:first-video";

export interface FirstVideoPreference {
	/** "Later": hidden for good. */
	readonly dismissed: boolean;
	/** A video has finished rendering here: the card's third step, kept across loads. */
	readonly rendered: boolean;
	/** The three steps held and the completion line was shown: gone from the next load. */
	readonly completed: boolean;
}

export const DEFAULT_FIRST_VIDEO_PREFERENCE: FirstVideoPreference = {
	dismissed: false,
	rendered: false,
	completed: false,
};

export function parseFirstVideoPreference(raw: string | null): FirstVideoPreference {
	if (raw === null) {
		return DEFAULT_FIRST_VIDEO_PREFERENCE;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return DEFAULT_FIRST_VIDEO_PREFERENCE;
		}
		const fields = parsed as Record<string, unknown>;
		return {
			dismissed: fields.dismissed === true,
			rendered: fields.rendered === true,
			completed: fields.completed === true,
		};
	} catch {
		return DEFAULT_FIRST_VIDEO_PREFERENCE;
	}
}

export function readFirstVideoPreference(): FirstVideoPreference {
	try {
		return parseFirstVideoPreference(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY));
	} catch {
		// Private mode or blocked storage: the card still works, just amnesiac.
		return DEFAULT_FIRST_VIDEO_PREFERENCE;
	}
}

export function writeFirstVideoPreference(preference: FirstVideoPreference): void {
	try {
		window.localStorage.setItem(FIRST_VIDEO_STORAGE_KEY, JSON.stringify(preference));
	} catch {
		// A preference we cannot store is a preference we do not promise to keep.
	}
}
