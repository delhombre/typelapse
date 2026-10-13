import {
	type AppRouteKey,
	type HeadTag,
	ROUTE_HEADS,
	routeHeadTags,
	routeHeadText,
} from "@/application/routing/route-head";
import { useDocumentTitle } from "@/presentation/hooks/use-document-title";
import { useEffect } from "react";

/**
 * The origin the host wrote the canonical address on, or null where the
 * document has none (a dev server): the client cannot know the site's origin
 * itself, because staging serves the production one.
 */
function servedOrigin(): string | null {
	const href = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
	return href ? new URL(href).origin : null;
}

/** Write a route's words, and its address and card where the host wrote them, into the tags the document already has. */
function say(route: AppRouteKey, origin: string | null): void {
	const head = ROUTE_HEADS[route];
	const tags: readonly HeadTag[] = origin ? routeHeadTags(head, origin) : routeHeadText(head);
	for (const tag of tags) {
		if (tag.kind === "meta") {
			const element = document.head.querySelector<HTMLMetaElement>(
				`meta[${tag.attribute}="${tag.key}"]`,
			);
			if (element) {
				element.content = tag.content;
			}
		} else if (tag.kind === "canonical") {
			const element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
			if (element) {
				element.href = tag.href;
			}
		}
	}
}

/**
 * Say what this page is in the tab and in the document's description, Open
 * Graph and Twitter tags, canonical address and share card while it is on
 * screen, from the same table the static host writes the served document from
 * (`route-head.ts`), and give the landing's back when it leaves. A hard load has
 * already been served the route's own tags; this keeps a walk between routes
 * saying the same, so the strings are not written a second time here.
 *
 * Tags are edited in place, never added, so there is still one of each. What
 * comes back is the landing's, not whatever the page found when it mounted: a
 * hard load of /pricing would otherwise hand pricing's words and address to the
 * landing. `title` is for a page whose tab says more than the table's (the
 * studio's project name).
 */
export function useRouteHead(route: AppRouteKey, title: string = ROUTE_HEADS[route].title): void {
	useDocumentTitle(title);
	useEffect(() => {
		const origin = servedOrigin();
		say(route, origin);
		return () => say("landing", origin);
	}, [route]);
}
