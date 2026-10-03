import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The bundle decides the theme, but the document is painted before it runs:
 * with no hint, a dark-mode visitor got the light paper on every refresh of /
 * and every hard load of /app. The inline script in index.html answers the
 * same question the app will, from the same inputs, before the first paint.
 */

const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const SCRIPT = HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

function runAt(path: string, osDark: boolean, stored: string | null): HTMLElement {
	const root = document.documentElement;
	root.removeAttribute("data-landing-theme");
	root.classList.remove("dark");
	window.history.replaceState(null, "", path);
	localStorage.clear();
	if (stored) localStorage.setItem("typelapse.landing-theme", stored);
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: osDark && query === "(prefers-color-scheme: dark)",
	}));
	new Function(SCRIPT)();
	return root;
}

describe("the theme before the bundle runs", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		window.history.replaceState(null, "", "/");
	});

	it("exists in index.html", () => {
		expect(SCRIPT).toContain("typelapse.landing-theme");
	});

	it("opens the landing in the theme its visitor picked, over the OS", () => {
		expect(runAt("/", false, "dark").dataset.landingTheme).toBe("dark");
		expect(runAt("/", true, "light").dataset.landingTheme).toBe("light");
	});

	it("opens the landing in the OS theme before any choice", () => {
		expect(runAt("/", true, null).dataset.landingTheme).toBe("dark");
		expect(runAt("/", false, null).dataset.landingTheme).toBe("light");
	});

	it("opens the studio dark on a dark OS, as its theme store will", () => {
		expect(runAt("/app", true, "light").classList.contains("dark")).toBe(true);
		expect(runAt("/app", false, "dark").classList.contains("dark")).toBe(false);
	});
});
