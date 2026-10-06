/**
 * Share-by-link: encode a project payload as base64 in the URL hash.
 * Format: #share=<base64-encoded JSON>
 *
 * The payload is the SAME shape JSON export writes and the template catalog is
 * authored in (see `ProjectPayload`), so a link restores the entire studio
 * through the one hydration path, `useSnippetStore.importFromJson`.
 */

import type { ProjectPayload } from "@/application/project/project-payload";
import { notify } from "@/presentation/stores/notice.store";

export function encodeShareLink(data: ProjectPayload): string {
	const json = JSON.stringify(data);
	const base64 = btoa(unescape(encodeURIComponent(json)));
	return `${window.location.origin}${window.location.pathname}#share=${base64}`;
}

export function decodeShareLink(): ProjectPayload | null {
	const hash = window.location.hash;
	if (!hash.startsWith("#share=")) {
		return null;
	}

	try {
		const base64 = hash.slice("#share=".length);
		const json = decodeURIComponent(escape(atob(base64)));
		const data = JSON.parse(json) as ProjectPayload;

		if (typeof data.title !== "string" || typeof data.code !== "string") {
			return null;
		}

		return data;
	} catch {
		return null;
	}
}

/**
 * Open the project a `#share=` link carries, once, on boot. A link that cannot
 * be read (broken base64, not JSON, not a project, or refused by the studio)
 * says so in one line instead of opening the default studio as if nothing had
 * been asked; either way the hash is dropped so a reload does not repeat it.
 */
export function openShareLinkOnBoot(importFromJson: (json: string) => void): void {
	if (!window.location.hash.startsWith("#share=")) {
		return;
	}
	const shareData = decodeShareLink();
	let opened = false;
	if (shareData) {
		try {
			// importFromJson restores the export-store settings (tempo, zoom,
			// typewriter, progress style) from the same snapshot, so no manual
			// re-application is needed here.
			importFromJson(JSON.stringify(shareData));
			opened = true;
		} catch {
			// Reported below, with every other way a link can fail to open.
		}
	}
	history.replaceState(null, "", window.location.pathname);
	if (!opened) {
		notify("That share link could not be read.", { tone: "error" });
	}
}

export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
