import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pricingView } from "@/application/billing/pricing-view";
import { LANDING_DOCUMENT_TITLE, studioDocumentTitle } from "@/application/project/document-title";
import { APP_PATHS } from "@/application/routing/app-paths";
import {
	ROUTE_HEADS,
	routeHeadFor,
	routeHeadTags,
	routeHeadText,
} from "@/application/routing/route-head";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://typelapse.com";

describe("the route head table", () => {
	it("has one head for every routed page, on that page's own address", () => {
		for (const [key, path] of Object.entries(APP_PATHS)) {
			expect(ROUTE_HEADS[key as keyof typeof APP_PATHS].path, key).toBe(path);
		}
		expect(Object.keys(ROUTE_HEADS).sort()).toEqual(Object.keys(APP_PATHS).sort());
	});

	it("gives each page its own title and description", () => {
		const heads = Object.values(ROUTE_HEADS);

		expect(new Set(heads.map((head) => head.title)).size).toBe(heads.length);
		expect(new Set(heads.map((head) => head.description)).size).toBe(heads.length);
	});

	it("finds a head by address, with or without a trailing slash, and none for any other", () => {
		expect(routeHeadFor("/pricing")).toBe(ROUTE_HEADS.pricing);
		expect(routeHeadFor("/pricing/")).toBe(ROUTE_HEADS.pricing);
		expect(routeHeadFor("/")).toBe(ROUTE_HEADS.landing);
		expect(routeHeadFor("/nowhere")).toBeNull();
		expect(routeHeadFor("/app/extra")).toBeNull();
	});

	it("keeps the public pages' descriptions under the 160 characters a results page shows", () => {
		// The studio is a tool, not a page to be found by its sentence, and its
		// wording is the owner's (it must not overclaim what stays on the device).
		for (const key of ["landing", "pricing"] as const) {
			expect(ROUTE_HEADS[key].description.length, key).toBeLessThanOrEqual(160);
		}
	});

	it("says what the studio sends nowhere: nothing leaves the device unless a hosted render is picked", () => {
		expect(ROUTE_HEADS.studio.description).toBe(
			"The Typelapse studio: paste a pull request, a diff or a snippet, shape the steps and export the video on your own device. Nothing is uploaded unless you pick a hosted render.",
		);
	});

	it("is the pricing view's description: the table is the one source", () => {
		const view = pricingView({ reading: { kind: "pending" } });

		expect(view.description).toBe(ROUTE_HEADS.pricing.description);
		expect(ROUTE_HEADS.pricing.description).toMatch(/^Exporting on your own device is free/);
	});

	it("is the title the studio and the landing hand back to the tab", () => {
		expect(LANDING_DOCUMENT_TITLE).toBe(ROUTE_HEADS.landing.title);
		expect(studioDocumentTitle("Untitled")).toBe(ROUTE_HEADS.studio.title);
	});
});

describe("a route's tags", () => {
	it("write the canonical and the share URLs on the configured origin, trailing slash or not", () => {
		for (const origin of [ORIGIN, `${ORIGIN}/`]) {
			const tags = routeHeadTags(ROUTE_HEADS.pricing, origin);

			expect(tags).toContainEqual({ kind: "canonical", href: "https://typelapse.com/pricing" });
			expect(tags).toContainEqual(
				expect.objectContaining({ key: "og:url", content: "https://typelapse.com/pricing" }),
			);
			expect(tags).toContainEqual(
				expect.objectContaining({ key: "og:image", content: "https://typelapse.com/og.png" }),
			);
		}
	});

	it("carry the full set the issue lists", () => {
		const tags = routeHeadTags(ROUTE_HEADS.studio, ORIGIN);
		const keys = tags.flatMap((tag) => (tag.kind === "meta" ? [tag.key] : [tag.kind]));

		for (const key of [
			"title",
			"description",
			"canonical",
			"og:title",
			"og:description",
			"og:url",
			"og:image",
			"og:type",
			"twitter:card",
			"twitter:title",
			"twitter:description",
		]) {
			expect(keys, key).toContain(key);
		}
	});

	it("say a share title of their own only where the card wants other words than the tab", () => {
		const text = (key: string, route: keyof typeof ROUTE_HEADS) =>
			routeHeadText(ROUTE_HEADS[route]).find((tag) => tag.kind === "meta" && tag.key === key);

		expect(text("og:title", "pricing")).toMatchObject({ content: "Pricing · Typelapse" });
		expect(text("twitter:title", "landing")).toMatchObject({
			content: ROUTE_HEADS.landing.shareTitle,
		});
	});
});

describe("index.html's own block", () => {
	const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
	const block = html.match(/<!-- route-head -->([\s\S]*?)<!-- \/route-head -->/)?.[1] ?? "";

	it("holds the landing's words, which the host replaces for every other page", () => {
		const head = ROUTE_HEADS.landing;

		expect(block).toContain(`<title>${head.title}</title>`);
		expect(block).toContain(`content="${head.description}"`);
		expect(block).toContain(`property="og:title" content="${head.shareTitle}"`);
		expect(block).toContain(`name="twitter:title" content="${head.shareTitle}"`);
		expect(block).toContain(`content="${head.image.alt}"`);
		expect(block).toContain(`content="${head.image.path}"`);
	});

	it("names the studio's tab, before the bundle runs, with the table's own words", () => {
		expect(html).toContain(`document.title = "${ROUTE_HEADS.studio.title}"`);
	});

	it("is the only place the document names its title", () => {
		expect(html.match(/<title>/g)).toHaveLength(1);
		expect(html.indexOf("<title>")).toBeGreaterThan(html.indexOf("<!-- route-head -->"));
	});
});
