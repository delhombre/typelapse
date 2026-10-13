// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHROME_COLOR } from "@/presentation/chrome-color";
import { describe, expect, it } from "vitest";

/**
 * One paper (#283). The studio painted #fafaf9, a neutral ramp step, while the
 * landing, index.html's metas and the forced-light `theme-color` said #faf9f6:
 * on a phone the browser chrome and the studio page differed by a shade. The
 * decision is one token, `--color-paper`, and every surface that is "the page"
 * reads it, light and dark; `--color-neutral-50` stays a ramp step.
 */

const read = (file: string) => readFileSync(resolve(__dirname, "../..", file), "utf8");
const appCss = read("src/app.css");
const cameraCss = read("src/presentation/studio-camera.css");
const indexHtml = read("index.html");

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The declaration block of the rule whose selector list is exactly `selector`. */
function rule(css: string, selector: string): string {
	const match = new RegExp(`^${escapeRegex(selector)}\\s*\\{([^}]*)\\}`, "m").exec(css);
	if (!match) throw new Error(`no rule "${selector}"`);
	return match[1] ?? "";
}

const declared = (block: string, property: string) =>
	new RegExp(`(?:^|[\\s;])${escapeRegex(property)}:\\s*([^;]+);`).exec(block)?.[1]?.trim();

/** The selector list that opens the rule declaring `--color-paper: <value>`. */
function selectorsDeclaring(css: string, value: string): string {
	const at = css.indexOf(`--color-paper: ${value};`);
	const open = css.lastIndexOf("{", at);
	const close = css.lastIndexOf("}", open);
	return css.slice(close + 1, open).replace(/\/\*[\s\S]*?\*\//g, "");
}

const PAPER = { light: "#faf9f6", dark: "#121110" } as const;
const THEME_PAPER = /--color-paper:\s*(#[0-9a-f]{6});/gi;

describe("--color-paper is declared once per theme", () => {
	it("is #faf9f6 in light and #121110 in dark, and nowhere else", () => {
		const values = [...appCss.matchAll(THEME_PAPER)].map((match) => match[1]?.toLowerCase());
		expect(values).toEqual([PAPER.light, PAPER.dark]);
	});

	it("reaches the document on both sides of the product in dark", () => {
		const selectors = selectorsDeclaring(appCss, PAPER.dark);
		for (const wanted of [
			'.landing-root[data-theme="dark"]',
			'html[data-landing-theme="dark"]',
			"html.dark:not([data-landing-theme])",
		]) {
			expect(selectors, wanted).toContain(wanted);
		}
	});
});

describe("every page-level surface reads --color-paper", () => {
	const PAGE = "var(--color-paper)";

	it("paints the document under the landing, in both themes", () => {
		expect(declared(rule(appCss, 'html[data-landing-theme="light"]'), "background")).toBe(PAGE);
		expect(declared(rule(appCss, 'html[data-landing-theme="dark"]'), "background")).toBe(PAGE);
	});

	it("paints the document under the studio, in both themes", () => {
		expect(declared(rule(appCss, "html:not([data-landing-theme])"), "background")).toBe(PAGE);
		expect(declared(rule(appCss, "html.dark:not([data-landing-theme])"), "background")).toBe(PAGE);
	});

	it("paints the studio root, both shells, in both themes", () => {
		expect(declared(rule(appCss, ".sc-root"), "background")).toBe(PAGE);
		expect(declared(rule(appCss, ".dark .sc-root"), "background")).toBe(PAGE);
	});

	it("gives the desktop studio and the code editor's page the same paper", () => {
		const block = /:is\(\.studio-camera-root[^{]*\{([^}]*)\}/.exec(cameraCss)?.[1] ?? "";
		expect(declared(block, "--camera-paper")).toBe(PAGE);
		expect(cameraCss).not.toMatch(/--camera-paper:\s*var\(--color-neutral/);
	});

	it("leaves --color-neutral-50 a ramp step, declared once and never the page", () => {
		expect(appCss.match(/#fafaf9/gi)).toHaveLength(1);
		expect(appCss.match(/--color-neutral-50:\s*#fafaf9;/g)).toHaveLength(1);
		expect(cameraCss).not.toMatch(/#fafaf9/i);
		expect(declared(rule(appCss, ".sc-root"), "background")).not.toContain("neutral");
	});
});

describe("the browser chrome says the same paper", () => {
	const metas = [
		...indexHtml.matchAll(/<meta name="theme-color" media="([^"]+)" content="(#[0-9a-f]{6})"/gi),
	].map(([, media, content]) => [
		media?.includes("dark") ? "dark" : "light",
		content?.toLowerCase(),
	]);

	it("has both index.html metas on the paper", () => {
		expect(Object.fromEntries(metas)).toEqual(PAPER);
	});

	it("has the forced theme-color on the paper", () => {
		expect(CHROME_COLOR).toEqual(PAPER);
	});

	it("has the pre-paint boot paper on the paper in both themes", () => {
		const boots = [...indexHtml.matchAll(/--boot-paper:\s*(#[0-9a-f]{6})/gi)].map((match) =>
			match[1]?.toLowerCase(),
		);
		expect(new Set(boots.slice(0, 1))).toEqual(new Set([PAPER.light]));
		expect(new Set(boots.slice(1))).toEqual(new Set([PAPER.dark]));
	});

	it("has the code editor's page on the paper too", () => {
		expect(read("src/application/editor/monaco-theme.ts")).toContain(`paper: "${PAPER.light}"`);
	});
});
