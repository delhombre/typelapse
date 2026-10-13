import { useEffect } from "react";

const TAGS = ['meta[name="description"]', 'meta[property="og:description"]'] as const;

/**
 * Say what this page is in the document's description (and its Open Graph twin)
 * while it is on screen, and give the landing's back when it leaves. index.html
 * writes one description for every route, because the host serves one document;
 * the tags are edited in place, never added, so there is still one of each.
 */
export function useDocumentDescription(description: string): void {
	useEffect(() => {
		const changed = TAGS.flatMap((selector) => {
			const tag = document.head.querySelector<HTMLMetaElement>(selector);
			return tag ? [{ tag, original: tag.content }] : [];
		});
		for (const { tag } of changed) {
			tag.content = description;
		}
		return () => {
			for (const { tag, original } of changed) {
				tag.content = original;
			}
		};
	}, [description]);
}
