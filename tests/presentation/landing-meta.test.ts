// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { absolutizeSocialImages, socialOriginWarning } from "../../vite-plugin-absolute-og";

/**
 * What a crawler reads before anyone sees the page: the title, the description
 * and the share card. Viability D1 decided what they say (sharp, in the
 * browser, from a pull request; mixed media second), and the README, the hero
 * and these tags have to say the same product on launch day.
 */

const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

function meta(attribute: "name" | "property", key: string): string {
	const value = HTML.match(new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"`))?.[1];
	expect(value, `index.html should declare ${key}`).toBeDefined();
	return value as string;
}

function title(): string {
	return HTML.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
}

describe("the landing's meta tags", () => {
	it("lead with sharpness, the browser and the pull request", () => {
		for (const text of [
			title(),
			meta("name", "description"),
			meta("property", "og:title"),
			meta("name", "twitter:title"),
		]) {
			expect(text).toMatch(/sharp/i);
		}
		for (const text of [meta("name", "description"), meta("property", "og:description")]) {
			expect(text).toMatch(/in your browser/i);
			expect(text).toMatch(/pull request/i);
		}
	});

	it("name mixed media second", () => {
		const description = meta("name", "description");

		expect(description).toMatch(/text, images, video and audio/i);
		expect(description.search(/sharp/i)).toBeLessThan(description.search(/text, images/i));
	});

	it("say the same thing on every network", () => {
		expect(meta("property", "og:title")).toBe(meta("name", "twitter:title"));
		expect(meta("property", "og:description")).toBe(meta("name", "twitter:description"));
		expect(meta("property", "og:description")).toBe(meta("name", "description"));
	});

	it("write their copy without em-dashes, exclamation marks or the old pitch", () => {
		const head = HTML.slice(0, HTML.indexOf("</head>"));

		expect(head).not.toContain("—");
		expect(head).not.toMatch(/!\s*"/);
		expect(head).not.toMatch(/beautiful code animations/i);
	});
});

describe("the share image", () => {
	it("is root-relative in the source, so the build can place it", () => {
		expect(meta("property", "og:image")).toBe("/og.png");
		expect(meta("name", "twitter:image")).toBe("/og.png");
	});

	it("becomes absolute on the deployed origin at build time", () => {
		const built = absolutizeSocialImages(HTML, "https://typelapse.example/");

		expect(built).toContain(
			'<meta property="og:image" content="https://typelapse.example/og.png" />',
		);
		expect(built).toContain(
			'<meta name="twitter:image" content="https://typelapse.example/og.png" />',
		);
		// Only the images: the favicon and the font preload stay same-origin paths.
		expect(built).toContain('href="/favicon.svg"');
		expect(built).toContain('href="/fonts/IoskeleyMono-Regular.woff2"');
	});

	it("warns at build time when the origin is missing or local, and only then", () => {
		expect(socialOriginWarning(undefined)).toMatch(/TYPELAPSE_APP_URL is not set/);
		// .env.example ships the local address: copied into a deploy, it was silent.
		expect(socialOriginWarning("http://localhost:5173")).toMatch(/local address/);
		expect(socialOriginWarning("http://127.0.0.1:4173")).toMatch(/local address/);
		expect(socialOriginWarning("https://typelapse.example")).toBeNull();
	});
});
