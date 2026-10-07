const SITE = "Typelapse";

/**
 * The landing's title: what index.html's `<title>` says and what a page that
 * borrowed the tab gives back. The same words are written in index.html, which
 * cannot import this, and a test holds the two together.
 */
export const LANDING_DOCUMENT_TITLE = "Typelapse: sharp code videos from a pull request";

/** What a project is called until someone names it: "Untitled", then "Untitled 2" and on. */
const DEFAULT_NAME = /^untitled(?: \d+)?$/i;

/**
 * The tab's title for the studio: "Studio" while the project has no name of its
 * own, the project's name once it does. The landing and the 404 have titles of
 * their own, so a tab always says which of the three it is.
 */
export function studioDocumentTitle(projectTitle: string): string {
	const name = projectTitle.trim();
	return DEFAULT_NAME.test(name) || name === "" ? `Studio · ${SITE}` : `${name} · ${SITE}`;
}
