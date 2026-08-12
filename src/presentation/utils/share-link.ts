/**
 * Share-by-link: encode a project payload as base64 in the URL hash.
 * Format: #share=<base64-encoded JSON>
 *
 * The payload is the SAME shape JSON export writes and the template catalog is
 * authored in (see `ProjectPayload`), so a link restores the entire studio
 * through the one hydration path, `useSnippetStore.importFromJson`.
 */

import type { ProjectPayload } from "@/application/project/project-payload";

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

export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
