// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * The two screens before the bundle (the noscript and the failed boot) were
 * system-ui on a white page in every theme, and Tailwind's preflight, which
 * lands with the stylesheet when only the script fails, took the heading's
 * weight and the paragraphs' margins. They are the 404 family's material now.
 */

const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const STYLE = HTML.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const SCRIPT =
	[...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)]
		.map((match) => match[1] ?? "")
		.find((script) => script.includes("typelapse.landing-theme")) ?? "";

const block = (selector: string) =>
	STYLE.match(new RegExp(`${selector.replace(/[.[\]"=():-]/g, "\\$&")}\\s*{([^}]*)}`))?.[1] ?? "";

describe("the screens that run before the bundle", () => {
	it("sets them in Geist, with the app's fallback metrics, not in system-ui", () => {
		expect(STYLE).toMatch(/font-family:\s*"Geist";\s*src:\s*url\(\/fonts\/Geist-latin\.woff2\)/);
		expect(block(".boot-screen")).toMatch(/font:[^;]*"Geist"/);
		expect(HTML).not.toMatch(/font:\s*16px\/1\.5 system-ui/);
	});

	it("paints the paper and the ink themselves, not the browser's canvas", () => {
		expect(HTML).not.toContain("CanvasText");
		expect(block(".boot-screen")).toMatch(/background:\s*var\(--boot-paper\)/);
		expect(block(".boot-screen")).toMatch(/text-align:\s*center/);
	});

	it("goes dark with the OS when no script could say otherwise, and with the stored theme when it did", () => {
		expect(STYLE).toMatch(
			/@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-boot-theme\]\)\s*{[^}]*--boot-paper:\s*#121110/,
		);
		expect(block(':root[data-boot-theme="dark"]')).toMatch(/--boot-paper:\s*#121110/);
		expect(block(':root[data-boot-theme="dark"]')).toMatch(/--boot-ink:\s*#f5f3ef/);
	});

	it("keeps the heading's weight and the paragraphs' margins out of preflight's reach", () => {
		expect(block(".boot-screen h1")).toMatch(/font-weight:\s*600/);
		expect(block(".boot-screen h1")).toMatch(/margin:\s*0 0 4px/);
		expect(block(".boot-screen p")).toMatch(/margin:\s*0/);
	});

	it("is not shown by its own display while hidden, and clears the notch and the home indicator", () => {
		expect(block(".boot-screen[hidden]")).toMatch(/display:\s*none/);
		expect(block(".boot-screen")).toMatch(/env\(safe-area-inset-top\)/);
		expect(block(".boot-screen")).toMatch(/env\(safe-area-inset-bottom\)/);
		expect(block(".boot-screen")).toMatch(/100dvh/);
	});

	it("gives the link a 44px target without moving a line", () => {
		const link = block(".boot-link");
		// 13px above and below a 19px glyph box is 45px; the same margin takes it back out.
		expect(link).toMatch(/padding:\s*13px 6px/);
		expect(link).toMatch(/margin:\s*-13px -6px/);
	});

	it("names the stored theme before anything is painted", () => {
		const run = (stored: string | null, osDark: boolean) => {
			document.documentElement.removeAttribute("data-boot-theme");
			window.history.replaceState(null, "", "/app");
			localStorage.clear();
			if (stored) {
				localStorage.setItem("typelapse.studio-theme", stored);
			}
			vi.stubGlobal("matchMedia", (query: string) => ({
				matches: osDark && query === "(prefers-color-scheme: dark)",
			}));
			new Function(SCRIPT)();
			vi.unstubAllGlobals();
			return document.documentElement.dataset.bootTheme;
		};
		expect(run(null, true)).toBe("dark");
		expect(run("light", true)).toBe("light");
		expect(run("dark", false)).toBe("dark");
	});
});
