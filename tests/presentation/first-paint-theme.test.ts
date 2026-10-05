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

function runAt(
	path: string,
	osDark: boolean,
	stored: string | null,
	studioStored: string | null = null,
): HTMLElement {
	const root = document.documentElement;
	root.removeAttribute("data-landing-theme");
	root.classList.remove("dark");
	window.history.replaceState(null, "", path);
	localStorage.clear();
	if (stored) localStorage.setItem("typelapse.landing-theme", stored);
	if (studioStored) localStorage.setItem("typelapse.studio-theme", studioStored);
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

	it("still answers the OS when storage is blocked", () => {
		// A blocked storage throws on read; the first paint used to give up with
		// it, and the landing's error state opened light on a dark OS.
		const blocked = {
			getItem: () => {
				throw new DOMException("blocked", "SecurityError");
			},
		};
		for (const [path, read] of [
			["/", (root: HTMLElement) => root.dataset.landingTheme === "dark"],
			["/nope", (root: HTMLElement) => root.classList.contains("dark")],
		] as const) {
			const root = document.documentElement;
			root.removeAttribute("data-landing-theme");
			root.classList.remove("dark");
			window.history.replaceState(null, "", path);
			vi.stubGlobal("localStorage", blocked);
			vi.stubGlobal("matchMedia", (query: string) => ({
				matches: query === "(prefers-color-scheme: dark)",
			}));
			new Function(SCRIPT)();
			expect(read(root)).toBe(true);
			vi.unstubAllGlobals();
		}
	});

	it("opens the studio in the theme picked there, over the OS", () => {
		expect(runAt("/app", false, null, "dark").classList.contains("dark")).toBe(true);
		expect(runAt("/app", true, null, "light").classList.contains("dark")).toBe(false);
	});
});
