import { useEffect } from "react";

/**
 * Per-route `<title>` and description.
 *
 * `index.html` carries the site's defaults, which is right for `/` and wrong for
 * every other route: without this, a shared `/compare` link previews as the
 * homepage. The hook restores whatever it found on unmount, so navigating back
 * to `/` gets the document's own values again rather than the last page's.
 *
 * This is a client-side SPA: a crawler that does not run JS still sees the
 * defaults in `index.html`. That is a pre-existing property of the app, not
 * something this hook pretends to fix — it fixes the shared link and the tab.
 */
export interface DocumentMeta {
	readonly title: string;
	readonly description: string;
}

/** The meta tags kept in step with the description, by attribute selector. */
const DESCRIPTION_SELECTORS = [
	'meta[name="description"]',
	'meta[property="og:description"]',
	'meta[name="twitter:description"]',
] as const;

/** The meta tags kept in step with the title. */
const TITLE_SELECTORS = ['meta[property="og:title"]', 'meta[name="twitter:title"]'] as const;

function setContent(selectors: readonly string[], value: string): (() => void)[] {
	const restores: (() => void)[] = [];
	for (const selector of selectors) {
		const tag = document.querySelector(selector);
		if (!tag) {
			continue;
		}
		const previous = tag.getAttribute("content") ?? "";
		tag.setAttribute("content", value);
		restores.push(() => tag.setAttribute("content", previous));
	}
	return restores;
}

export function useDocumentMeta({ title, description }: DocumentMeta): void {
	useEffect(() => {
		const previousTitle = document.title;
		document.title = title;
		const restores = [
			...setContent(TITLE_SELECTORS, title),
			...setContent(DESCRIPTION_SELECTORS, description),
		];

		return () => {
			document.title = previousTitle;
			for (const restore of restores) {
				restore();
			}
		};
	}, [title, description]);
}
