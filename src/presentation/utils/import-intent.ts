/**
 * Carrying an *unresolved* paste from the landing into the studio.
 *
 * The studio already reads `#share=`, but a share link carries a snippet that
 * has already been resolved — title, code, language, steps. The hero cannot
 * produce that: a pull-request URL is still a promise at the moment you press
 * Render, and resolving it means a network round trip that belongs in the
 * studio, where there is somewhere to show it happening. So this carries the
 * paste itself, verbatim, and the studio does the work on arrival.
 *
 * Format: `#import=<base64url JSON>`, or `#import=~` when the paste is too big
 * to live in a URL, in which case the JSON waits in sessionStorage. Small
 * intents stay in the URL because a link that opens a PR in Typelapse is worth
 * being a link; a 200 kB diff paste is not, and would break the URL rather than
 * travel in it.
 */

import type { ImportPlayMode } from "@/presentation/hooks/use-source-import";

/** A paste the studio has not read yet, plus how the user wants it played. */
export interface ImportIntent {
	/** Exactly what was pasted. Classified on arrival, not here. */
	source: string;
	/** Whole change or one chapter per commit. Only meaningful for a PR. */
	playMode?: ImportPlayMode;
}

const HASH_KEY = "#import=";

/** Beyond this the payload goes to sessionStorage and the URL keeps a marker. */
const MAX_URL_PAYLOAD = 6000;

/** Marks "the payload is in sessionStorage, not in this URL". */
const STASH_MARKER = "~";

export const IMPORT_INTENT_STASH_KEY = "typelapse:import-intent";

function toBase64Url(json: string): string {
	const bytes = new TextEncoder().encode(json);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function parseIntent(json: string): ImportIntent | null {
	const data = JSON.parse(json) as Partial<ImportIntent>;
	if (typeof data.source !== "string" || data.source === "") {
		return null;
	}
	const playMode = data.playMode === "commit" ? "commit" : undefined;
	return playMode ? { source: data.source, playMode } : { source: data.source };
}

/**
 * Encode an intent into the URL fragment to navigate to. Stashes the payload in
 * sessionStorage when it is too large to belong in a URL, so this has a side
 * effect by design: the returned hash is only meaningful in this tab when it
 * comes back as {@link STASH_MARKER}.
 */
export function encodeImportIntent(intent: ImportIntent): string {
	const json = JSON.stringify(intent);
	const encoded = toBase64Url(json);
	if (encoded.length <= MAX_URL_PAYLOAD) {
		return `${HASH_KEY}${encoded}`;
	}
	try {
		window.sessionStorage.setItem(IMPORT_INTENT_STASH_KEY, json);
		return `${HASH_KEY}${STASH_MARKER}`;
	} catch {
		// Private mode, or a full quota. The long URL is the worse option but it
		// is the one that still works.
		return `${HASH_KEY}${encoded}`;
	}
}

function clearStash() {
	try {
		window.sessionStorage.removeItem(IMPORT_INTENT_STASH_KEY);
	} catch {
		// Nothing to do: a stash we cannot clear is a stash we never wrote.
	}
}

/**
 * Read the intent this page was opened with and consume it in the same breath:
 * the hash is scrubbed and the stash dropped before returning. Consuming is the
 * point — under StrictMode the mounting effect runs twice, and an intent that
 * survived the first read would fetch the same pull request twice.
 *
 * Returns null when there is nothing to import, including when the payload is
 * corrupt: an unreadable intent is not worth an error, the studio simply opens
 * on its default snippet.
 */
export function takeImportIntent(): ImportIntent | null {
	const hash = window.location.hash;
	if (!hash.startsWith(HASH_KEY)) {
		return null;
	}
	const payload = hash.slice(HASH_KEY.length);
	// Scrub first, unconditionally: a payload we failed to read must not be
	// re-read on the next mount either.
	history.replaceState(null, "", window.location.pathname + window.location.search);

	try {
		if (payload === STASH_MARKER) {
			const stashed = window.sessionStorage.getItem(IMPORT_INTENT_STASH_KEY);
			clearStash();
			return stashed === null ? null : parseIntent(stashed);
		}
		return parseIntent(fromBase64Url(payload));
	} catch {
		clearStash();
		return null;
	}
}
