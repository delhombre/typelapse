// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What index.html does before, and instead of, the bundle (ticket #214): fetch
 * what the route in the address bar needs, name the tab, say something to a
 * visitor whose JavaScript is off or never arrived. The inline scripts are run
 * here exactly as written, against the page as written.
 */

const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const SCRIPTS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "");
const ROUTE_HINTS = SCRIPTS.find((script) => script.includes("modulepreload")) ?? "";
const BOOT_FAILURE = SCRIPTS.find((script) => script.includes("boot-failed")) ?? "";

const STUDIO_FILES = ["/assets/studio-route-abc.js", "/assets/studio-route-def.css"];

function openPage(path: string, { chunks = true } = {}) {
	window.history.replaceState(null, "", path);
	// The page as written, scripts not run: jsdom parses it without executing it.
	document.documentElement.innerHTML = HTML;
	document.title = "Typelapse: the landing";
	for (const link of document.head.querySelectorAll(
		'link[rel="preload"], link[rel="modulepreload"]',
	)) {
		link.remove();
	}
	if (chunks) {
		const list = document.createElement("script");
		list.type = "application/json";
		list.id = "typelapse-studio-chunks";
		list.textContent = JSON.stringify(STUDIO_FILES);
		document.head.prepend(list);
	}
}

function hints() {
	return [...document.head.querySelectorAll("link")]
		.filter((link) => ["preload", "modulepreload"].includes(link.getAttribute("rel") ?? ""))
		.map((link) => `${link.getAttribute("rel")} ${link.getAttribute("href")}`);
}

const FONTS = [
	"preload /fonts/IoskeleyMono-Regular.woff2",
	"preload /fonts/JetBrainsMono-latin.woff2",
];

describe("the files a route is sent ahead for", () => {
	afterEach(() => window.history.replaceState(null, "", "/"));

	it("exists in index.html", () => {
		expect(ROUTE_HINTS).not.toBe("");
	});

	it("keeps Geist's preload static: every route sets text in it", () => {
		expect(HTML).toMatch(/<link rel="preload" href="\/fonts\/Geist-latin\.woff2"[^>]*crossorigin/);
	});

	it("sends the landing for the UI mono and the hero's code font, and for nothing of the studio", () => {
		openPage("/");
		new Function(ROUTE_HINTS)();
		expect(hints()).toEqual(FONTS);
		expect(document.title).toBe("Typelapse: the landing");
	});

	it("sends /app for the same fonts, its own files, and names the tab", () => {
		openPage("/app");
		new Function(ROUTE_HINTS)();
		expect(hints()).toEqual([
			...FONTS,
			`modulepreload ${STUDIO_FILES[0]}`,
			`preload ${STUDIO_FILES[1]}`,
		]);
		expect(document.title).toBe("Studio · Typelapse");
		const style = document.head.querySelector(`link[href="${STUDIO_FILES[1]}"]`);
		expect(style?.getAttribute("as")).toBe("style");
		expect(style?.hasAttribute("crossorigin")).toBe(true);
	});

	it("also answers for /app/ and a hash or query on it", () => {
		for (const path of ["/app/", "/app?x=1", "/app#import=abc"]) {
			openPage(path);
			new Function(ROUTE_HINTS)();
			expect(hints()).toContain(`modulepreload ${STUDIO_FILES[0]}`);
		}
	});

	it("sends no font that the 404 does not set text in, and none of the studio's files", () => {
		for (const path of ["/nope", "/application", "/apple"]) {
			openPage(path);
			new Function(ROUTE_HINTS)();
			expect(hints()).toEqual([]);
			expect(document.title).toBe("Typelapse: the landing");
		}
	});

	it("still names /app and loads its fonts when the build wrote no list (a dev server)", () => {
		openPage("/app", { chunks: false });
		new Function(ROUTE_HINTS)();
		expect(hints()).toEqual(FONTS);
		expect(document.title).toBe("Studio · Typelapse");
	});
});

describe("a bundle that never arrives", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		openPage("/app");
		new Function(BOOT_FAILURE)();
	});
	afterEach(() => vi.useRealTimers());

	const note = () => document.getElementById("boot-failed") as HTMLElement;

	it("exists in index.html, inside the root the bundle replaces, hidden", () => {
		expect(BOOT_FAILURE).not.toBe("");
		expect(note().closest("#root")).not.toBeNull();
		expect(note().hidden).toBe(true);
	});

	it("says so, with a way to retry, once the wait is over", () => {
		vi.advanceTimersByTime(5_000);
		expect(note().hidden).toBe(true);
		vi.advanceTimersByTime(10_000);
		expect(note().hidden).toBe(false);
		expect(note().textContent).toMatch(/still loading/i);
		expect(note().querySelector("a")).not.toBeNull();
	});

	it("says so at once when the bundle's script fails", () => {
		const script = document.createElement("script");
		document.body.append(script);
		script.dispatchEvent(new Event("error"));
		expect(note().hidden).toBe(false);
	});

	it("stays out of the way of an app that did mount", () => {
		const root = document.getElementById("root") as HTMLElement;
		// React replaces the root's children; the note goes with them.
		root.replaceChildren(document.createElement("main"));
		vi.advanceTimersByTime(60_000);
		expect(document.getElementById("boot-failed")).toBeNull();
	});

	it("does not take a failing image for a failing bundle", () => {
		const image = document.createElement("img");
		document.body.append(image);
		image.dispatchEvent(new Event("error"));
		expect(note().hidden).toBe(true);
	});
});

describe("a visitor without JavaScript", () => {
	const noscript = () => {
		const block = document.querySelector("noscript");
		// jsdom parses a noscript's content as text when scripting is enabled.
		const holder = document.createElement("div");
		holder.innerHTML = block?.textContent ?? block?.innerHTML ?? "";
		return holder;
	};

	beforeEach(() => openPage("/"));

	it("is given the heading, the description and a way into the studio", () => {
		const content = noscript();
		const title = HTML.match(/<title>([^<]*)<\/title>/)?.[1];
		const description = HTML.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1];
		expect(content.querySelector("h1")?.textContent).toBe(title);
		expect(content.textContent).toContain(description);
		expect(content.querySelector('a[href="/app"]')).not.toBeNull();
	});

	it("says why the studio needs JavaScript, in words and not in a symbol", () => {
		expect(noscript().textContent).toMatch(/needs JavaScript/i);
		expect(noscript().textContent).not.toContain("—");
	});
});
