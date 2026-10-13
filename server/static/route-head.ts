import { type HeadTag, routeHeadFor, routeHeadTags } from "../../src/application/routing/route-head";

/** The public origin canonical and share URLs are written on, unless `TYPELAPSE_SITE_ORIGIN` says otherwise. */
export const DEFAULT_SITE_ORIGIN = "https://typelapse.com";

interface SiteOriginEnvironment {
	readonly TYPELAPSE_SITE_ORIGIN?: string;
}

/**
 * The origin canonical addresses and share cards are written on.
 *
 * Deliberately not `TYPELAPSE_APP_URL`: that one is where this deployment is
 * reached, and staging is not where the site lives. Staging keeps the
 * production canonical so a search engine that finds it files it under
 * typelapse.com instead of indexing a duplicate, and a share card pasted from
 * staging still loads its image. Set it only to move the production site.
 * A value that is not an http(s) origin stops startup rather than ship a
 * canonical nobody can follow.
 */
export function siteOriginFrom(environment: SiteOriginEnvironment = process.env): string {
	const configured = environment.TYPELAPSE_SITE_ORIGIN?.trim();
	if (!configured) {
		return DEFAULT_SITE_ORIGIN;
	}
	let url: URL;
	try {
		url = new URL(configured);
	} catch {
		throw new Error(`TYPELAPSE_SITE_ORIGIN (${configured}) must be an http(s) origin`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`TYPELAPSE_SITE_ORIGIN (${configured}) must be an http(s) origin`);
	}
	return url.origin;
}

/** index.html carries the landing's tags between these two comments; the host swaps the block per route. */
const BLOCK = /<!-- route-head -->[\s\S]*?<!-- \/route-head -->/;

export function hasRouteHeadBlock(shell: string): boolean {
	return BLOCK.test(shell);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function serialize(tag: HeadTag): string {
	switch (tag.kind) {
		case "title":
			return `<title>${escapeHtml(tag.text)}</title>`;
		case "canonical":
			return `<link rel="canonical" href="${escapeHtml(tag.href)}" />`;
		case "meta":
			return `<meta ${tag.attribute}="${tag.key}" content="${escapeHtml(tag.content)}" />`;
	}
}

/**
 * The shell with the route's own tags, or the shell untouched for a path the
 * client does not route (the 404 keeps the landing's defaults). Plain string
 * replacement of one block: there is no rendering here. The replacer is a
 * function because a replacement string would read `$&` in a title as a pattern.
 */
export function injectRouteHead(shell: string, path: string, origin: string): string {
	const head = routeHeadFor(path);
	if (!head) {
		return shell;
	}
	const block = `<!-- route-head -->\n\t\t${routeHeadTags(head, origin).map(serialize).join("\n\t\t")}\n\t\t<!-- /route-head -->`;
	return shell.replace(BLOCK, () => block);
}
