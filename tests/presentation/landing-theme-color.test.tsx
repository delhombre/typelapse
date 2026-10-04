import { useLandingTheme } from "@/presentation/landing/use-landing-theme";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/* The browser chrome (status bar, URL bar) takes its colour from `theme-color`,
   and index.html can only answer the OS preference. A visitor who flips the
   landing to dark on a light phone kept a cream bar over a near-black page. */

function stubColorScheme(dark: boolean) {
	window.matchMedia = ((query: string) => ({
		matches: dark && query.includes("dark"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
}

function themeColors() {
	return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
		(meta) => meta.content,
	);
}

beforeEach(() => {
	window.localStorage.clear();
	document.head.innerHTML = `
		<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F6" />
		<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121110" />`;
});

afterEach(() => {
	document.head.innerHTML = "";
});

describe("landing theme colour", () => {
	it("paints the browser chrome with the theme the visitor picked, whatever the OS says", () => {
		stubColorScheme(false);
		const { result } = renderHook(() => useLandingTheme());

		expect(themeColors()).toEqual(["#faf9f6", "#faf9f6"]);

		act(() => result.current[1]());

		expect(result.current[0]).toBe("dark");
		expect(themeColors()).toEqual(["#121110", "#121110"]);
	});

	it("starts dark on a dark OS", () => {
		stubColorScheme(true);
		renderHook(() => useLandingTheme());

		expect(themeColors()).toEqual(["#121110", "#121110"]);
	});

	it("hands the tags back to the OS preference when the landing unmounts", () => {
		stubColorScheme(false);
		const { result, unmount } = renderHook(() => useLandingTheme());
		act(() => result.current[1]());

		unmount();

		expect(themeColors()).toEqual(["#FAF9F6", "#121110"]);
	});
});
