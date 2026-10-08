import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The studio's appearance: Light, Dark or System, System by default (design
 * audit 2026-10-08, D6). One tap on "Switch to light mode" used to pin light
 * forever under a dark OS, with no way back to following it.
 */

const STORAGE_KEY = "typelapse.studio-appearance";
/** Where the old two-state toggle kept its side. */
const LEGACY_KEY = "typelapse.studio-theme";

type Listener = (event: { matches: boolean }) => void;

/** A stand-in OS whose colour scheme can change while the studio is open. */
function fakeOs(dark: boolean) {
	const listeners = new Set<Listener>();
	const os = { dark };
	vi.stubGlobal("matchMedia", (query: string) => ({
		get matches() {
			return os.dark && query === "(prefers-color-scheme: dark)";
		},
		media: query,
		addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
		removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
	}));
	return {
		switchTo(next: "dark" | "light") {
			os.dark = next === "dark";
			for (const listener of listeners) listener({ matches: os.dark });
		},
	};
}

function themeColors(): string[] {
	return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
		(tag) => tag.content,
	);
}

const isDark = () => document.documentElement.classList.contains("dark");

async function freshStore() {
	vi.resetModules();
	return (await import("@/presentation/stores/theme-mode.store")).useThemeModeStore;
}

describe("the studio's appearance", () => {
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

	it("follows the system until a side is chosen", async () => {
		fakeOs(true);
		const store = await freshStore();
		expect(store.getState().preference).toBe("system");
		expect(store.getState().mode).toBe("dark");
	});

	it("follows the system live while it is set to System", async () => {
		const os = fakeOs(false);
		const store = await freshStore();
		store.getState().setPreference("system");
		expect(isDark()).toBe(false);

		os.switchTo("dark");
		expect(store.getState().mode).toBe("dark");
		expect(isDark()).toBe(true);

		os.switchTo("light");
		expect(store.getState().mode).toBe("light");
		expect(isDark()).toBe(false);
	});

	it("holds a forced side when the system changes", async () => {
		const os = fakeOs(false);
		const store = await freshStore();
		store.getState().setPreference("light");
		os.switchTo("dark");
		expect(store.getState().mode).toBe("light");
		expect(isDark()).toBe(false);
	});

	it("keeps a forced side across a reload, and System as no stored side", async () => {
		fakeOs(false);
		const store = await freshStore();
		store.getState().setPreference("dark");
		expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
		expect((await freshStore()).getState().preference).toBe("dark");

		(await freshStore()).getState().setPreference("system");
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect((await freshStore()).getState().preference).toBe("system");
	});

	it("turns a side the old toggle stored into System, once", async () => {
		fakeOs(true);
		localStorage.setItem(LEGACY_KEY, "light");
		const store = await freshStore();
		expect(store.getState().preference).toBe("system");
		expect(store.getState().mode).toBe("dark");
		expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

		// A side chosen after the migration is the visitor's, and stays.
		store.getState().setPreference("light");
		expect((await freshStore()).getState().preference).toBe("light");
	});

	it("rewrites the status bar's colour only for a forced side", async () => {
		fakeOs(false);
		const store = await freshStore();
		store.getState().setPreference("system");
		expect(themeColors()).toEqual(["#FAF9F6", "#121110"]);

		store.getState().setPreference("dark");
		expect(themeColors()).toEqual(["#121110", "#121110"]);
		store.getState().setPreference("light");
		expect(themeColors()).toEqual(["#fafaf9", "#fafaf9"]);

		// Back to System, the metas answer the OS again through their media queries.
		store.getState().setPreference("system");
		expect(themeColors()).toEqual(["#FAF9F6", "#121110"]);
	});

	it("steps System, Light, Dark and back, for the desktop's one button", async () => {
		fakeOs(false);
		const store = await freshStore();
		const seen = [store.getState().preference];
		for (let press = 0; press < 3; press++) {
			store.getState().cycle();
			seen.push(store.getState().preference);
		}
		expect(seen).toEqual(["system", "light", "dark", "system"]);
	});
});
