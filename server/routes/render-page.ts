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

const NOT_FOUND_SENTENCE = "This video is private or no longer exists.";
const UNAVAILABLE_SENTENCE = "This video cannot be shown right now. Try again in a moment.";

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
 * temperatures; the font is the landing's Geist from the app's /fonts.
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
	src: local("Arial"),local("ArialMT"),local("Liberation Sans");
	size-adjust: 101.77%;
	ascent-override: 98.75%;
	descent-override: 28.99%;
	line-gap-override: 0%;
}
:root {
	--paper: #faf9f6;
	--ink: #1c1b19;
	--ash: #6e6b64;
	--hairline: rgb(28 27 25/.1);
	--primary: #f1be01;
	--primary-hover: #f5c92a;
	--on-primary: #1c1b19;
	--accent: oklch(.62 .19 268);
	--ease-out: cubic-bezier(.23,1,.32,1);
	color-scheme: light;
}
@media (prefers-color-scheme:dark) {
	:root {
		--paper: #121110;
		--ink: #f5f3ef;
		--ash: #a8a39a;
		--hairline: rgb(245 243 239/.12);
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
	width: min(100%,1100px,calc(70svh * var(--w) / var(--h)));
	min-width: min(100%,320px);
	margin-inline: auto;
}
.frame {
	margin: 0;
	aspect-ratio: var(--w)/var(--h);
	border-radius: 12px;
	overflow: hidden;
	background: #000;
	box-shadow: 0 0 0 1px var(--hairline),0 1px 2px rgb(0 0 0/.06),0 16px 40px -16px rgb(0 0 0/.24);
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
	transition: background-color .15s var(--ease-out),transform .16s var(--ease-out);
}
@media (hover:hover) {
	.button:hover {
		background: var(--primary-hover);
	}
}
.button:active {
	transform: scale(.97);
}
:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
}
.gone {
	max-width: 32ch;
	margin: 0 auto;
	text-align: center;
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
	text-decoration-color: var(--hairline);
}
@media (hover:hover) {
	footer a:hover {
		color: var(--ink);
	}
}
@media (prefers-reduced-motion:reduce) {
	.button {
		transition: none;
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
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
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
	const image = page.hasPoster
		? { url: `${origin}${posterPath}`, width: page.width, height: page.height }
		: { url: `${origin}${SITE_CARD.path}`, width: SITE_CARD.width, height: SITE_CARD.height };
	const title = escapeHtml(page.title);
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
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image.url}">${
		// The poster is the first thing painted; fetching it with the HTML keeps the
		// frame from flashing black before the player asks for it.
		page.hasPoster ? `\n<link rel="preload" as="image" href="${posterPath}">` : ""
	}`;

	const poster = page.hasPoster ? ` poster="${posterPath}"` : "";
	const body = `<main>
<div class="stage" style="--w:${page.width};--h:${page.height}">
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

function sentencePage(sentence: string): string {
	return documentShell(
		`<title>Typelapse</title>\n<meta name="robots" content="noindex">`,
		`<main><p class="gone">${sentence}</p></main>`,
	);
}

/**
 * `/v/<id>`: the public page of a Cloud render (decision log 2026-10-04 D4.1).
 * The page and its media addresses are stable; the media ones re-check the
 * public flag and sign a fresh object URL on every request, so "Make private"
 * takes effect at once for anyone who loads the page or the video again.
 */
export const createRenderPageRoute = (deps: RenderPageRouteDeps): Hono => {
	const route = new Hono();
	const appUrlOf = (c: Context) => deps.appUrl ?? new URL(c.req.url).origin;

	const notFound = (c: Context) => {
		c.header("Cache-Control", "no-store");
		return c.html(sentencePage(NOT_FOUND_SENTENCE), 404);
	};
	const unavailable = (c: Context) => {
		c.header("Cache-Control", "no-store");
		return c.html(sentencePage(UNAVAILABLE_SENTENCE), 503);
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

	return route;
};
