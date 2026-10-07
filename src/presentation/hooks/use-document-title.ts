import { LANDING_DOCUMENT_TITLE } from "@/application/project/document-title";
import { useEffect } from "react";

/**
 * Name the tab while a page is on screen, and hand it back to the landing when
 * the page leaves, so walking from the studio to the landing does not carry the
 * studio's title along.
 *
 * What is restored is the landing's own title, not whatever the tab said when
 * the page mounted: on a hard load of /app, index.html has already named the tab
 * "Studio", so a captured value would put "Studio" onto the landing the first
 * time the brand link is followed. The studio and the 404 are only ever left for
 * the landing (or for each other, and the next page names the tab itself).
 */
export function useDocumentTitle(title: string): void {
	useEffect(() => {
		document.title = title;
	}, [title]);
	useEffect(() => {
		return () => {
			document.title = LANDING_DOCUMENT_TITLE;
		};
	}, []);
}
