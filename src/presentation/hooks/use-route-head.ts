import {
	type AppRouteKey,
	type HeadTag,
	ROUTE_HEADS,
	routeHeadText,
} from "@/application/routing/route-head";
import { useDocumentTitle } from "@/presentation/hooks/use-document-title";
import { useEffect } from "react";

type MetaTag = Extract<HeadTag, { kind: "meta" }>;

function metaTagsOf(route: AppRouteKey): readonly MetaTag[] {
	return routeHeadText(ROUTE_HEADS[route]).filter((tag): tag is MetaTag => tag.kind === "meta");
}

/** Write the description and the Open Graph and Twitter words into the tags the document already has. */
function say(route: AppRouteKey): void {
	for (const tag of metaTagsOf(route)) {
		const element = document.head.querySelector<HTMLMetaElement>(
			`meta[${tag.attribute}="${tag.key}"]`,
		);
		if (element) {
			element.content = tag.content;
		}
	}
}

/**
 * Say what this page is in the tab and in the document's description, Open
 * Graph and Twitter words while it is on screen, from the same table the static
 * host writes the served document from (`route-head.ts`), and give the
 * landing's back when it leaves. A hard load has already been served the
 * route's own words; this keeps a walk between routes saying the same, so the
 * strings are not written a second time here.
 *
 * Tags are edited in place, never added, so there is still one of each. What
 * comes back is the landing's, not whatever the page found when it mounted: a
 * hard load of /pricing would otherwise hand pricing's words to the landing.
 * `title` is for a page whose tab says more than the table's (the studio's
 * project name).
 */
export function useRouteHead(route: AppRouteKey, title: string = ROUTE_HEADS[route].title): void {
	useDocumentTitle(title);
	useEffect(() => {
		say(route);
		return () => say("landing");
	}, [route]);
}
