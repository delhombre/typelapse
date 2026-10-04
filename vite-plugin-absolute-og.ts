import { type Plugin, loadEnv } from "vite";

/**
 * Makes the share image in `index.html` an absolute URL when the app is built.
 *
 * Crawlers do not resolve a relative `og:image`: X, Slack and LinkedIn all read
 * `/og.png` as no image at all, so a launch link would unfurl as a bare title.
 * The origin is only known where the app is deployed, so it is read at build
 * time from `TYPELAPSE_APP_URL`, the public URL `.env.example` already asks
 * every deployment to set, rather than written into the HTML or added as a
 * second variable that could disagree with it.
 *
 * Without it the build still succeeds, on the documented local default, and
 * says so: a build that refused to run without a production URL would break
 * every preview and CI build for a tag only a crawler reads.
 */

const FALLBACK_ORIGIN = "http://localhost:5173";

/** The meta tags whose `content` is an image URL a crawler fetches. */
const IMAGE_TAG =
	/(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")(\/[^"]*)(")/g;

/** Rewrite every root-relative share image in `html` onto `origin`. */
export function absolutizeSocialImages(html: string, origin: string): string {
	const base = new URL(origin).origin;
	return html.replace(IMAGE_TAG, (_, open: string, path: string, close: string) => {
		return `${open}${base}${path}${close}`;
	});
}

/**
 * What the build should say about the origin it was given, or null when it is a
 * public one. `.env.example` ships the local address, so a deploy that copied it
 * built silently with every share card pointing at a laptop.
 */
export function socialOriginWarning(configured: string | undefined): string | null {
	if (!configured) {
		return `TYPELAPSE_APP_URL is not set; og:image and twitter:image point at ${FALLBACK_ORIGIN}. Set it to the public URL before deploying.`;
	}
	const { hostname } = new URL(configured);
	if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
		return `TYPELAPSE_APP_URL is a local address (${configured}); og:image and twitter:image will not load outside this machine. Set it to the public URL before deploying.`;
	}
	return null;
}

export function absoluteOgImage(): Plugin {
	let origin = FALLBACK_ORIGIN;
	return {
		name: "typelapse-absolute-og-image",
		apply: "build",
		configResolved(config) {
			const env = loadEnv(config.mode, config.envDir || config.root, "");
			const configured = (process.env.TYPELAPSE_APP_URL ?? env.TYPELAPSE_APP_URL)?.trim();
			if (configured) {
				origin = configured;
			}
			const warning = socialOriginWarning(configured);
			if (warning) {
				config.logger.warn(warning);
			}
		},
		transformIndexHtml(html) {
			return absolutizeSocialImages(html, origin);
		},
	};
}
