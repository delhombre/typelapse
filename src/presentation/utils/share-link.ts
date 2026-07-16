/**
 * Share-by-link: encode snippet state as compressed base64 in URL hash.
 * Format: #share=<base64url-encoded JSON>
 */

interface ShareData {
	title: string;
	code: string;
	language: string;
	themeName: string;
	background: string;
	steps: { code: string; duration: number; focus?: string }[];
}

export function encodeShareLink(data: ShareData): string {
	const json = JSON.stringify(data);
	const base64 = btoa(unescape(encodeURIComponent(json)));
	return `${window.location.origin}${window.location.pathname}#share=${base64}`;
}

export function decodeShareLink(): ShareData | null {
	const hash = window.location.hash;
	if (!hash.startsWith("#share=")) {
		return null;
	}

	try {
		const base64 = hash.slice("#share=".length);
		const json = decodeURIComponent(escape(atob(base64)));
		const data = JSON.parse(json) as ShareData;

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
