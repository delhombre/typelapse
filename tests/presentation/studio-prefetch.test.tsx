// @vitest-environment jsdom
import { useStudioPrefetch } from "@/presentation/landing/use-studio-prefetch";
import {
	STUDIO_CHUNKS_ELEMENT_ID,
	prefetchStudio,
	studioChunkUrls,
} from "@/presentation/utils/studio-prefetch";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STUDIO_CHUNKS_ELEMENT_ID as PLUGIN_ELEMENT_ID } from "../../vite-plugin-studio-preload";

const FILES = ["/assets/studio-route-abc.js", "/assets/studio-route-def.css"];

function carryList(json: string | null) {
	document.getElementById(STUDIO_CHUNKS_ELEMENT_ID)?.remove();
	if (json === null) {
		return;
	}
	const element = document.createElement("script");
	element.type = "application/json";
	element.id = STUDIO_CHUNKS_ELEMENT_ID;
	element.textContent = json;
	document.head.prepend(element);
}

const prefetched = () =>
	[...document.head.querySelectorAll('link[rel="prefetch"]')].map((link) =>
		link.getAttribute("href"),
	);

describe("the studio's files, as the page carries them", () => {
	beforeEach(() => {
		for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) {
			link.remove();
		}
	});
	afterEach(() => carryList(null));

	it("reads the same element the build writes", () => {
		expect(STUDIO_CHUNKS_ELEMENT_ID).toBe(PLUGIN_ELEMENT_ID);
	});

	it("lists them", () => {
		carryList(JSON.stringify(FILES));
		expect(studioChunkUrls()).toEqual(FILES);
	});

	it("lists nothing when the page carries no list (a dev server) or an unreadable one", () => {
		carryList(null);
		expect(studioChunkUrls()).toEqual([]);
		carryList("{not json");
		expect(studioChunkUrls()).toEqual([]);
		carryList('{"a":1}');
		expect(studioChunkUrls()).toEqual([]);
	});

	it("keeps only same-origin paths", () => {
		carryList(JSON.stringify([...FILES, "https://elsewhere.example/x.js", 7]));
		expect(studioChunkUrls()).toEqual(FILES);
	});

	it("prefetches each file once, however often it is asked", () => {
		carryList(JSON.stringify(FILES));
		prefetchStudio();
		prefetchStudio();
		expect(prefetched()).toEqual(FILES);
		expect(document.head.querySelector('link[href$=".css"]')?.getAttribute("as")).toBe("style");
		expect(document.head.querySelector('link[href$=".js"]')?.getAttribute("as")).toBe("script");
	});

	it("does nothing when there is nothing to fetch", () => {
		carryList(null);
		prefetchStudio();
		expect(prefetched()).toEqual([]);
	});
});

function Landing() {
	useStudioPrefetch();
	return (
		<main>
			<a href="/app">Open studio</a>
			<a href="/app#import=abc">Import</a>
			<a href="https://github.com/">Source</a>
			<textarea aria-label="Paste" data-studio-intent="" />
			<p>Words</p>
		</main>
	);
}

describe("the landing's ways into the studio", () => {
	beforeEach(() => {
		for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) {
			link.remove();
		}
		carryList(JSON.stringify(FILES));
	});
	afterEach(() => {
		cleanup();
		carryList(null);
	});

	it("fetch the studio when a pointer reaches one", () => {
		render(<Landing />);
		expect(prefetched()).toEqual([]);

		fireEvent.pointerOver(screen.getByText("Source"));
		fireEvent.pointerOver(screen.getByText("Words"));
		expect(prefetched()).toEqual([]);

		fireEvent.pointerOver(screen.getByText("Open studio"));
		expect(prefetched()).toEqual(FILES);
	});

	it("fetch it when the keyboard focuses one, or a finger touches one", () => {
		const view = render(<Landing />);
		fireEvent.focusIn(screen.getByText("Import"));
		expect(prefetched()).toEqual(FILES);

		view.unmount();
		for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) {
			link.remove();
		}
		render(<Landing />);
		fireEvent.touchStart(screen.getByText("Open studio"));
		expect(prefetched()).toEqual(FILES);
	});

	it("fetch it when the hero's paste field takes focus, the surest way in", () => {
		render(<Landing />);
		fireEvent.focusIn(screen.getByLabelText("Paste"));
		expect(prefetched()).toEqual(FILES);
	});

	it("stop listening when the landing goes", () => {
		const view = render(<Landing />);
		const link = screen.getByText("Open studio");
		view.unmount();
		document.body.append(link);
		fireEvent.pointerOver(link);
		expect(prefetched()).toEqual([]);
	});
});
