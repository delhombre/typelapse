import { Logomark } from "@/presentation/components/ui/logomark";
import { useEffect } from "react";

const SHARE_TAGS = 'meta[property^="og:"], meta[name^="twitter:"]';

/**
 * The mark above a "not this page" face, and the document's share card taken down
 * while it is on screen.
 *
 * index.html writes the landing's Open Graph and Twitter tags for every route,
 * because the host serves one document. A 404 or an error face that kept them would
 * describe the landing under a page that says it does not exist, to anything that
 * reads the live document. They are put back where they were when the reader leaves,
 * so walking on to the landing finds its card.
 */
export function RouteStateHead({ noindex = false }: { readonly noindex?: boolean }) {
	useEffect(() => {
		const removed = [...document.head.querySelectorAll(SHARE_TAGS)].map((node) => ({
			node,
			next: node.nextSibling,
		}));
		for (const { node } of removed) {
			node.remove();
		}
		// The host owns the status; the page owns saying it is not for the index.
		let robots: HTMLMetaElement | null = null;
		if (noindex) {
			robots = document.createElement("meta");
			robots.name = "robots";
			robots.content = "noindex";
			document.head.append(robots);
		}
		return () => {
			robots?.remove();
			for (const { node, next } of removed) {
				document.head.insertBefore(node, next?.parentNode === document.head ? next : null);
			}
		};
	}, [noindex]);

	return <Logomark size={32} className="mb-5 text-ink" />;
}
