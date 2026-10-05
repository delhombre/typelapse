/**
 * The address that opens the studio on a source: `/app#import=…`, the link the
 * landing hero writes and the studio reads on arrival
 * (`presentation/utils/import-intent`). The format is written here so the
 * browser and the hosted server agree on it.
 *
 * A fragment is only as long as an address can be. The browser parks a longer
 * paste in its session storage and links to the marker; the server has no such
 * storage, so for it a source that does not fit is left out of the link.
 */

export const IMPORT_HASH_KEY = "#import=";

/** Beyond this many characters of payload the paste does not belong in a URL. */
export const MAX_IMPORT_URL_PAYLOAD = 6000;

/** What a link carries: the paste itself, verbatim, and how a pull request is played. */
export interface ImportIntentFields {
	readonly source: string;
	readonly playMode?: "whole" | "commit";
}

/** The intent as base64url of its JSON: no `+`, `/` or `=` to be mangled in transit. */
export function importIntentPayload(intent: ImportIntentFields): string {
	let binary = "";
	for (const byte of new TextEncoder().encode(JSON.stringify(intent))) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `#import=<payload>`, or null when the payload is too long to travel in an address. */
export function importIntentFragment(intent: ImportIntentFields): string | null {
	const payload = importIntentPayload(intent);
	return payload.length <= MAX_IMPORT_URL_PAYLOAD ? `${IMPORT_HASH_KEY}${payload}` : null;
}

/**
 * The studio's own address on `origin` (whatever path `origin` carries, the app
 * lives at `/app`), opening on `source`. A source too long for a link opens the
 * studio empty.
 */
export function studioImportLink(origin: string, source: string): string {
	const studio = `${new URL(origin).origin}/app`;
	const fragment = importIntentFragment({ source });
	return fragment ? `${studio}${fragment}` : studio;
}
