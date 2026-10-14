// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type AppRouteKey, ROUTE_HEADS } from "@/application/routing/route-head";
import { useRouteHead } from "@/presentation/hooks/use-route-head";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { injectRouteHead } from "../../server/static/route-head";

/**
 * Two writers say what a page is called: the static host, into the document a
 * scraper reads, and the hook, into the one a visitor walks through. They read
 * one table, and this holds them to it on the real index.html.
 */

const SHELL = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const ORIGIN = "https://typelapse.com";
const KEYS = Object.keys(ROUTE_HEADS) as AppRouteKey[];

const words = (head: Document | HTMLElement) => {
	const meta = (selector: string) =>
		head.querySelector<HTMLMetaElement>(selector)?.getAttribute("content");
	return {
		canonical: head.querySelector('link[rel="canonical"]')?.getAttribute("href"),
		ogUrl: meta('meta[property="og:url"]'),
		ogImage: meta('meta[property="og:image"]'),
		description: meta('meta[name="description"]'),
		ogTitle: meta('meta[property="og:title"]'),
		ogDescription: meta('meta[property="og:description"]'),
		twitterTitle: meta('meta[name="twitter:title"]'),
		twitterDescription: meta('meta[name="twitter:description"]'),
	};
};

function Page({ route }: { route: AppRouteKey }) {
	useRouteHead(route);
	return null;
}

function served(path: string): Document {
	return new DOMParser().parseFromString(injectRouteHead(SHELL, path, ORIGIN), "text/html");
}

describe("the static host and the client hook", () => {
	beforeEach(() => {
		// A hard load of the landing: the document as the host serves it.
		const landing = served("/");
		document.head.innerHTML = landing.head.innerHTML;
		document.title = landing.title;
	});
	afterEach(cleanup);

	for (const key of KEYS) {
		it(`say the same title and description on ${ROUTE_HEADS[key].path}`, () => {
			const fromHost = served(ROUTE_HEADS[key].path);

			render(<Page route={key} />);

			expect(document.title).toBe(fromHost.title);
			expect(words(document.head)).toEqual(words(fromHost));
			expect(fromHost.title).toBe(ROUTE_HEADS[key].title);
			expect(words(fromHost).description).toBe(ROUTE_HEADS[key].description);
		});
	}

	it("hand the landing's address and card back on leaving, after a hard load of another page", () => {
		for (const key of KEYS) {
			const hardLoad = served(ROUTE_HEADS[key].path);
			document.head.innerHTML = hardLoad.head.innerHTML;
			document.title = hardLoad.title;

			render(<Page route={key} />).unmount();

			expect(words(document.head), key).toEqual(words(served("/")));
			expect(document.title, key).toBe(ROUTE_HEADS.landing.title);
		}
	});

	it("leave the address alone where the document has none (a dev server)", () => {
		document.head.innerHTML = '<meta name="description" content="x">';

		render(<Page route="pricing" />);

		expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
		expect(document.head.querySelector('meta[property="og:url"]')).toBeNull();
	});

	it("serve one title tag per page, and keep the other head tags of the shell", () => {
		for (const key of KEYS) {
			const fromHost = served(ROUTE_HEADS[key].path);

			expect(fromHost.querySelectorAll("title")).toHaveLength(1);
			expect(fromHost.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
				`${ORIGIN}${ROUTE_HEADS[key].path}`,
			);
			expect(fromHost.querySelector('meta[name="theme-color"]')).not.toBeNull();
			expect(fromHost.querySelector('link[rel="apple-touch-icon"]')).not.toBeNull();
		}
	});
});
