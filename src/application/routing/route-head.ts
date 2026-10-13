import { deviceIntro } from "../billing/device-export-claim";
import { APP_PATHS } from "./app-paths";

/**
 * What each public page says about itself in the document's head: the tab, the
 * description, the canonical address and the share card. One table, three
 * readers, so none can drift from the others:
 *  - the static host writes the route's tags into the served index.html
 *    (`server/static/route-head.ts`), because a scraper (Slack, X, LinkedIn,
 *    iMessage) reads the first response and runs no JavaScript;
 *  - the client hook edits the same text in place while a page is on screen
 *    (`use-route-head.ts`), so a walk from one route to another says the same;
 *  - the pricing view reads its description here (`pricingView().description`).
 *
 * Relative imports: the Hono server loads this file under tsx, which has no "@/".
 */

export type AppRouteKey = keyof typeof APP_PATHS;

export interface ShareImage {
	/** Root-relative; the origin is the host's, so a crawler gets an absolute URL. */
	readonly path: string;
	readonly width: number;
	readonly height: number;
	readonly alt: string;
}

/** Rendered by Typelapse itself: a 1200x630 frame of the self-demo. */
const DEFAULT_SHARE_IMAGE: ShareImage = {
	path: "/og.png",
	width: 1200,
	height: 630,
	alt: "A code window on a purple and blue gradient, showing a function that captures code, morphs its steps and renders the video.",
};

export interface RouteHead {
	readonly path: string;
	readonly title: string;
	/** What og:title and twitter:title say, when a share card wants other words than the tab. */
	readonly shareTitle?: string;
	readonly description: string;
	readonly image: ShareImage;
}

const LANDING_DESCRIPTION =
	"Make a code video in your browser from a pull request, as sharp as its preview. Text, images, video and audio share the same scenes.";

export const ROUTE_HEADS: Readonly<Record<AppRouteKey, RouteHead>> = {
	landing: {
		path: APP_PATHS.landing,
		title: "Typelapse: sharp code videos from a pull request",
		shareTitle: "Typelapse: code videos as sharp as their preview",
		description: LANDING_DESCRIPTION,
		image: DEFAULT_SHARE_IMAGE,
	},
	studio: {
		path: APP_PATHS.studio,
		title: "Studio · Typelapse",
		description:
			"The Typelapse studio: paste a pull request, a diff or a snippet, shape the steps and export the video from your browser. Nothing is uploaded.",
		image: DEFAULT_SHARE_IMAGE,
	},
	pricing: {
		path: APP_PATHS.pricing,
		title: "Pricing · Typelapse",
		description: `Exporting on your own device is free: ${deviceIntro()}, no watermark, no account. Creator adds hosted renders with captions and audio baked in.`,
		image: DEFAULT_SHARE_IMAGE,
	},
};

const HEADS_BY_PATH: ReadonlyMap<string, RouteHead> = new Map(
	Object.values(ROUTE_HEADS).map((head) => [head.path, head]),
);

/** The head of a routed address, with or without its trailing slash; null for any other path. */
export function routeHeadFor(path: string): RouteHead | null {
	const bare = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
	return HEADS_BY_PATH.get(bare) ?? null;
}

export type HeadTag =
	| { readonly kind: "title"; readonly text: string }
	| {
			readonly kind: "meta";
			readonly attribute: "name" | "property";
			readonly key: string;
			readonly content: string;
	  }
	| { readonly kind: "canonical"; readonly href: string };

const name = (key: string, content: string): HeadTag => ({
	kind: "meta",
	attribute: "name",
	key,
	content,
});
const property = (key: string, content: string): HeadTag => ({
	kind: "meta",
	attribute: "property",
	key,
	content,
});

/**
 * The words of a head, which do not depend on where the site is served from:
 * what the client hook keeps in step as the route changes.
 */
export function routeHeadText(head: RouteHead): readonly HeadTag[] {
	const shareTitle = head.shareTitle ?? head.title;
	return [
		{ kind: "title", text: head.title },
		name("description", head.description),
		property("og:title", shareTitle),
		property("og:description", head.description),
		name("twitter:title", shareTitle),
		name("twitter:description", head.description),
	];
}

/**
 * The whole head block, on the site's origin: the words, then the canonical
 * address and the share card, whose URLs a crawler needs absolute.
 */
export function routeHeadTags(head: RouteHead, origin: string): readonly HeadTag[] {
	const base = origin.replace(/\/+$/, "");
	const url = `${base}${head.path}`;
	const image = `${base}${head.image.path}`;
	return [
		...routeHeadText(head),
		{ kind: "canonical", href: url },
		property("og:url", url),
		property("og:type", "website"),
		property("og:site_name", "Typelapse"),
		property("og:image", image),
		property("og:image:width", String(head.image.width)),
		property("og:image:height", String(head.image.height)),
		property("og:image:alt", head.image.alt),
		name("twitter:card", "summary_large_image"),
		name("twitter:image", image),
		name("twitter:image:alt", head.image.alt),
	];
}
