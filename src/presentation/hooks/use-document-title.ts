import { useEffect } from "react";

/**
 * Name the tab while a page is on screen, and give the previous name back when
 * it leaves, so walking from the studio to the landing does not carry the
 * studio's title along.
 *
 * Two effects, not one: the title follows the argument, but what to restore is
 * the title from before the page, read once. A single effect would restore the
 * last title it had set, and leave a stale name on the next page.
 */
export function useDocumentTitle(title: string): void {
	useEffect(() => {
		const before = document.title;
		return () => {
			document.title = before;
		};
	}, []);
	useEffect(() => {
		document.title = title;
	}, [title]);
}
