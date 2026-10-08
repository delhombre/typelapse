import { type Context, Hono } from "hono";
import {
	type HostedRenderPageService,
	type PublicRenderPage,
	publicRenderPageUrl,
} from "../../src/application/render/hosted-render-page";

export interface RenderPageRouteDeps {
	readonly pages: HostedRenderPageService;
	/** The public origin pages and their tags point at; the request's own origin when absent. */
	readonly appUrl?: string;
}

/** Job ids are `job_<uuid>`; anything else is a 404 before the database is asked. */
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** One heading for every dead end; the reason under it is what differs. */
const UNAVAILABLE_HEADING = "This video is not available";
const NOT_FOUND_REASON = "It is private or no longer exists.";
const UNAVAILABLE_REASON = "It cannot be shown right now. Try again in a moment.";

/** What a card or a screen reader is told about the site card used when a render has no poster. */
const SITE_CARD_ALT =
	"A code window on a purple and blue gradient, showing a function that captures code, morphs its steps and renders the video.";

/** The site card, used when a render has no poster frame of its own. */
const SITE_CARD = { path: "/og.png", width: 1200, height: 630 } as const;

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function megabytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function seconds(durationMs: number): string {
	return `${(durationMs / 1000).toFixed(1)} s`;
}

/**
 * The landing's paper palette, inline: this page is the API's own document and
 * loads no bundle. The values are app.css's `--color-*` tokens at both
 * temperatures, spelled as app.css spells them so that
 * `tests/server/render-page-tokens.test.ts` can compare the two files as text;
 * the font is the landing's Geist from the app's /fonts.
 */
const STYLES = `
@font-face {
	font-family: "Geist";
	src: url(/fonts/Geist-latin.woff2) format("woff2");
	font-weight: 100 900;
	font-display: swap;
}
@font-face {
	font-family: "Geist Fallback";
	src: local("Arial"), local("ArialMT"), local("Liberation Sans");
	font-weight: 100 500;
	size-adjust: 101.77%;
	ascent-override: 98.75%;
	descent-override: 28.99%;
	line-gap-override: 0%;
}
@font-face {
	font-family: "Geist Fallback";
	src: local("Arial Bold"), local("Arial-BoldMT"), local("Liberation Sans Bold");
	font-weight: 600 900;
	size-adjust: 100.08%;
	ascent-override: 100.42%;
	descent-override: 29.48%;
	line-gap-override: 0%;
}
:root {
	--paper: #faf9f6;
	--ink: #1c1b19;
	--ash: #6e6b64;
	--hairline: rgb(28 27 25 / 0.1);
	--primary: #f1be01;
	--primary-hover: #f5c92a;
	--on-primary: #1c1b19;
	--primary-glow: rgb(241 190 1 / 0.45);
	--accent: oklch(0.62 0.19 268);
	--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
	/* The landing's code frame (app.css .code-frame-glow): a black ring at 7% and
	   three soft layers on paper. */
	--frame-depth: 0 0 0 1px oklch(0 0 0/.07),0 2px 6px -2px oklch(0 0 0/.08),
		0 12px 32px -10px oklch(0 0 0/.16),0 26px 60px -18px oklch(0 0 0/.14);
	color-scheme: light;
}
@media (prefers-color-scheme:dark) {
	:root {
		--paper: #121110;
		--ink: #f5f3ef;
		--ash: #a8a39a;
		--hairline: rgb(245 243 239 / 0.12);
		/* A black video on near-black paper: the shadows cannot be seen, so the
		   edge is a white ring at 9%, as on the landing's dark frame. */
		--frame-depth: 0 0 0 1px oklch(1 0 0/.09),0 12px 32px -10px oklch(0 0 0/.55);
		color-scheme: dark;
	}
}
* {
	box-sizing: border-box;
}
html {
	background: var(--paper);
	-webkit-font-smoothing: antialiased;
	-webkit-text-size-adjust: 100%;
	-webkit-tap-highlight-color: transparent;
}
body {
	margin: 0;
	min-height: 100svh;
	display: flex;
	flex-direction: column;
	background: var(--paper);
	color: var(--ink);
	font: 400 16px/1.5 "Geist","Geist Fallback",ui-sans-serif,system-ui,sans-serif;
	padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
		max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
main {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding-block: clamp(8px,4svh,48px);
}
.stage {
	--cap: 70svh;
	width: min(100%,1100px,calc(var(--cap) * var(--w) / var(--h)));
	min-width: min(100%,320px);
	margin-inline: auto;
}
.frame {
	margin: 0;
	aspect-ratio: var(--w)/var(--h);
	border-radius: 12px;
	overflow: hidden;
	background: #000;
	box-shadow: var(--frame-depth);
}
video {
	display: block;
	width: 100%;
	height: 100%;
	background: #000;
}
.about {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 16px 24px;
	margin-top: 20px;
}
h1 {
	margin: 0;
	font-size: clamp(20px,1.2vw + 15px,26px);
	font-weight: 600;
	line-height: 1.2;
	letter-spacing: -.01em;
	text-wrap: balance;
	overflow-wrap: anywhere;
}
.facts {
	margin: 6px 0 0;
	color: var(--ash);
	font-size: 14px;
	font-variant-numeric: tabular-nums;
}
.button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 44px;
	padding: 0 20px;
	border-radius: 999px;
	background: var(--primary);
	color: var(--on-primary);
	font-size: 15px;
	font-weight: 500;
	text-decoration: none;
	white-space: nowrap;
	touch-action: manipulation;
	/* The glow is the primary's own light, as under the landing's filled actions. */
	box-shadow: 0 6px 20px -6px var(--primary-glow);
	transition: background-color .15s var(--ease-out),box-shadow .15s var(--ease-out),
		transform .16s var(--ease-out);
}
@media (hover:hover) {
	.button:hover {
		background: var(--primary-hover);
		box-shadow: 0 11px 28px -7px var(--primary-glow);
	}
}
.button:active {
	transform: scale(.97);
}
:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
}
@media (max-width:639px) {
	/* A phone reads from the top: the video leads, the paper it would sit
	   centred in goes below the action instead of above the video. */
	.stage {
		margin-block: 0 auto;
	}
	/* A 9:16 video at the page's width is taller than the phone: the action
	   went below the fold. The picture takes 60% of the screen's height, and a
	   long title takes two lines; the whole of it stays in the tab's title and
	   the player's label. */
	.stage[data-portrait] {
		--cap: 60svh;
	}
	.stage[data-portrait] h1 {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
}
@media (min-width:640px) {
	/* Taller than wide, on a window with room: the text sits beside the picture
	   instead of under it, so neither is pushed past the window's height. */
	.stage[data-portrait] {
		--cap: 72svh;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 40px;
		width: min(100%,calc(var(--cap) * var(--w) / var(--h) + 40px + 320px));
		min-width: 0;
	}
	.stage[data-portrait] .frame {
		flex: none;
		width: min(calc(var(--cap) * var(--w) / var(--h)),calc(100% - 280px));
	}
	.stage[data-portrait] .about {
		flex: 0 1 320px;
		min-width: 0;
		flex-direction: column;
		align-items: flex-start;
		margin-top: 0;
	}
}
.gone {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 24px;
	max-width: 32ch;
	margin: 0 auto;
	text-align: center;
}
.gone h1 {
	font-size: clamp(22px,.5vw + 20px,24px);
	letter-spacing: -.012em;
}
.reason {
	margin: -8px 0 0;
	color: var(--ash);
	font-size: 15px;
	line-height: 1.5;
	text-wrap: pretty;
}
footer {
	padding-top: 12px;
	text-align: center;
	font-size: 13px;
	color: var(--ash);
}
footer a {
	display: inline-flex;
	align-items: center;
	min-height: 44px;
	padding: 0 8px;
	color: inherit;
	text-underline-offset: 3px;
	touch-action: manipulation;
	text-decoration-color: color-mix(in oklch, var(--ash) 50%, transparent);
}
@media (hover:hover) {
	footer a:hover {
		color: var(--ink);
	}
}
@media (prefers-reduced-motion:reduce) {
	/* Less motion, not a harsher page: the colour still fades, the press does not move. */
	.button {
		transition-property: background-color,box-shadow;
	}
	.button:active {
		transform: none;
	}
}
`;

function documentShell(head: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/svg+xml" href="/favicon.svg" sizes="any">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F6">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121110">
<link rel="preload" href="/fonts/Geist-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>${STYLES}</style>
</head>
<body>
${body}
<footer><a href="/">Made with Typelapse</a></footer>
</body>
</html>
`;
}

/** One document for crawlers and people alike: crawlers do not run the SPA. */
export function renderPageHtml(page: PublicRenderPage, appUrl: string): string {
	const origin = new URL(appUrl).origin;
	const pageUrl = publicRenderPageUrl(appUrl, page.jobId);
	const id = encodeURIComponent(page.jobId);
	const videoPath = `/v/${id}/video`;
	const posterPath = `/v/${id}/poster.jpg`;
	const title = escapeHtml(page.title);
	const image = page.hasPoster
		? {
				url: `${origin}${posterPath}`,
				width: page.width,
				height: page.height,
				alt: `The first frame of ${title}, a code video made with Typelapse.`,
			}
		: {
				url: `${origin}${SITE_CARD.path}`,
				width: SITE_CARD.width,
				height: SITE_CARD.height,
				alt: SITE_CARD_ALT,
			};
	const description = escapeHtml(
		page.durationMs === null
			? "A code video made with Typelapse."
			: `A ${seconds(page.durationMs)} code video made with Typelapse.`,
	);
	const facts = [
		`${page.width} × ${page.height}`,
		page.codec,
		...(page.durationMs === null ? [] : [seconds(page.durationMs)]),
		`${page.fps} fps`,
		megabytes(page.byteSize),
	].join(" · ");
	const studio = page.studioShare
		? {
				href: `${origin}/app#share=${encodeURIComponent(page.studioShare)}`,
				label: "Open in the studio",
			}
		: { href: `${origin}/app`, label: "Make one in the studio" };
	const secure = origin.startsWith("https:")
		? `\n<meta property="og:video:secure_url" content="${origin}${videoPath}">`
		: "";

	const head = `<title>${title} · Typelapse</title>
<meta name="description" content="${description}">
<!-- A public link, not a listing: the owner can take it down, and an index would keep it. -->
<meta name="robots" content="noindex">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="Typelapse">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:video" content="${origin}${videoPath}">${secure}
<meta property="og:video:type" content="${escapeHtml(page.mimeType)}">
<meta property="og:video:width" content="${page.width}">
<meta property="og:video:height" content="${page.height}">
<meta property="og:image" content="${image.url}">
<meta property="og:image:width" content="${image.width}">
<meta property="og:image:height" content="${image.height}">
<meta property="og:image:alt" content="${image.alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image.url}">
<meta name="twitter:image:alt" content="${image.alt}">${
		// The poster is the first thing painted; fetching it with the HTML keeps the
		// frame from flashing black before the player asks for it.
		page.hasPoster ? `\n<link rel="preload" as="image" href="${posterPath}">` : ""
	}`;

	const poster = page.hasPoster ? ` poster="${posterPath}"` : "";
	const body = `<main>
<div class="stage"${page.height > page.width ? " data-portrait" : ""} style="--w:${page.width};--h:${page.height}">
<figure class="frame">
<video src="${videoPath}"${poster} width="${page.width}" height="${page.height}"
controls playsinline preload="metadata" aria-label="${title}"></video>
</figure>
<div class="about">
<div>
<h1>${title}</h1>
<p class="facts">${facts}</p>
</div>
<a class="button" href="${studio.href}">${studio.label}</a>
</div>
</div>
</main>`;

	return documentShell(head, body);
}

/** A page with nothing to play: why, and the one way on from it. */
function sentencePage(reason: string, next: { href: string; label: string }): string {
	const action = `\n<a class="button" href="${escapeHtml(next.href)}">${next.label}</a>`;
	return documentShell(
		`<title>${UNAVAILABLE_HEADING} · Typelapse</title>\n<meta name="robots" content="noindex">`,
		`<main><div class="gone"><h1>${UNAVAILABLE_HEADING}</h1>\n<p class="reason">${reason}</p>${action}</div></main>`,
	);
}

function notFoundResponse(c: Context, appUrl: string) {
	c.header("Cache-Control", "no-store");
	// A shared link that went dark is still someone arriving from a post: the
	// studio is the one useful next step, and the status stays a 404.
	const studio = `${new URL(appUrl).origin}/app`;
	return c.html(
		sentencePage(NOT_FOUND_REASON, { href: studio, label: "Make one in the studio" }),
		404,
	);
}

/**
 * The themed 404 for an address under `/v` that names no render: `/v`, `/v/`,
 * `/v/a/b`. Mounted by the API on its own when no render page is (local mode,
 * where nothing is published), so those addresses do not fall to a bare line.
 */
export const createRenderPageNotFoundRoute = (appUrl?: string): Hono => {
	const route = new Hono();
	route.all("*", (c) => notFoundResponse(c, appUrl ?? new URL(c.req.url).origin));
	return route;
};

/**
 * `/v/<id>`: the public page of a Cloud render (decision log 2026-10-04 D4.1).
 * The page and its media addresses are stable; the media ones re-check the
 * public flag and sign a fresh object URL on every request, so "Make private"
 * takes effect at once for anyone who loads the page or the video again.
 */
export const createRenderPageRoute = (deps: RenderPageRouteDeps): Hono => {
	const route = new Hono();
	const appUrlOf = (c: Context) => deps.appUrl ?? new URL(c.req.url).origin;

	const notFound = (c: Context) => notFoundResponse(c, appUrlOf(c));
	const unavailable = (c: Context) => {
		c.header("Cache-Control", "no-store");
		// The sentence says try again; the page's own address is the way to.
		const again = { href: c.req.path, label: "Try again" };
		return c.html(sentencePage(UNAVAILABLE_REASON, again), 503);
	};

	const media = (kind: "video" | "poster") => async (c: Context) => {
		const id = c.req.param("id") ?? "";
		if (!JOB_ID.test(id)) {
			return notFound(c);
		}
		let url: string | null;
		try {
			url = await deps.pages.media(id, kind);
		} catch {
			return unavailable(c);
		}
		if (!url) {
			return notFound(c);
		}
		c.header("Cache-Control", "no-store");
		return c.redirect(url, 302);
	};

	route.get("/:id/video", media("video"));
	route.get("/:id/poster.jpg", media("poster"));

	route.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!JOB_ID.test(id)) {
			return notFound(c);
		}
		let page: PublicRenderPage | null;
		try {
			page = await deps.pages.page(id);
		} catch {
			return unavailable(c);
		}
		if (!page) {
			return notFound(c);
		}
		// Short, so a page taken private does not linger in a shared cache.
		c.header("Cache-Control", "public, max-age=60");
		return c.html(renderPageHtml(page, appUrlOf(c)));
	});

	// Last: `/v`, `/v/` and anything deeper than a render's own addresses.
	route.all("*", notFound);

	return route;
};
