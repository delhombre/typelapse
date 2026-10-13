import { ROUTE_HEADS } from "../routing/route-head";

const SITE = "Typelapse";

/**
 * The landing's title: what a page that borrowed the tab gives back. It is the
 * route head table's, which the served index.html is also written from; the
 * source index.html cannot import it and a test holds the two together.
 */
export const LANDING_DOCUMENT_TITLE = ROUTE_HEADS.landing.title;

/** What a project is called until someone names it: "Untitled", then "Untitled 2" and on. */
const DEFAULT_NAME = /^untitled(?: \d+)?$/i;

/**
 * The tab's title for the studio: "Studio" while the project has no name of its
 * own, the project's name once it does. The landing and the 404 have titles of
 * their own, so a tab always says which of the three it is.
 */
export function studioDocumentTitle(projectTitle: string): string {
	const name = projectTitle.trim();
	return DEFAULT_NAME.test(name) || name === "" ? ROUTE_HEADS.studio.title : `${name} · ${SITE}`;
}
