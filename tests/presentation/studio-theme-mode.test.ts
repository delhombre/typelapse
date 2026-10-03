import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The studio's appearance toggle used to live only in memory: a reload went
 * back to the OS theme, and the status bar kept the OS colour over a studio
 * switched to the other side.
 */

const STORAGE_KEY = "typelapse.studio-theme";

function osPrefersDark(dark: boolean): void {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: dark && query === "(prefers-color-scheme: dark)",
		media: query,
		addEventListener() {},
		removeEventListener() {},
	}));
}

function themeColorTags(): HTMLMetaElement[] {
	return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

async function freshStore() {
	vi.resetModules();
	return (await import("@/presentation/stores/theme-mode.store")).useThemeModeStore;
}

describe("the studio theme", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.classList.remove("dark");
		document.head.innerHTML = `
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F6" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121110" />`;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("survives a reload", async () => {
		osPrefersDark(false);
		const store = await freshStore();
		expect(store.getState().mode).toBe("light");

		store.getState().toggle();
		expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");

		const reloaded = await freshStore();
		expect(reloaded.getState().mode).toBe("dark");
	});

	it("follows the OS until the visitor picks a side", async () => {
		osPrefersDark(true);
		expect((await freshStore()).getState().mode).toBe("dark");
		localStorage.setItem(STORAGE_KEY, "light");
		expect((await freshStore()).getState().mode).toBe("light");
	});

	it("paints the status bar with the studio's paper when it is toggled", async () => {
		osPrefersDark(false);
		const store = await freshStore();

		store.getState().toggle();
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(themeColorTags().map((tag) => tag.content)).toEqual(["#121110", "#121110"]);

		store.getState().setMode("light");
		expect(themeColorTags().map((tag) => tag.content)).toEqual(["#fafaf9", "#fafaf9"]);
	});
});
