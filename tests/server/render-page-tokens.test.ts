import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The public render page is the API's own document and loads no bundle, so it
 * carries the landing's palette inline (`STYLES` in render-page.ts). A copy
 * drifts silently, the first time app.css changes a token. This reads both
 * files as text and fails the moment they disagree.
 */

const APP_CSS = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");
const PAGE = readFileSync(resolve(__dirname, "../../server/routes/render-page.ts"), "utf8");

/** What the page calls a token, and what app.css calls it. */
const TOKENS = [
	["--paper", "--color-paper"],
	["--ink", "--color-ink"],
	["--ash", "--color-ash"],
	["--hairline", "--color-hairline"],
	["--primary", "--color-primary"],
	["--primary-hover", "--color-primary-hover"],
	["--on-primary", "--color-on-primary"],
	["--primary-glow", "--color-primary-glow"],
	["--accent", "--color-accent"],
	["--ease-out", "--ease-out"],
] as const;

/** The value a custom property is given first in `source`, from `from` on. */
function declared(source: string, name: string, from = 0): string | null {
	const match = new RegExp(`(?:^|[\\s{;])${name}:\\s*([^;]+);`).exec(source.slice(from));
	return match?.[1]?.trim() ?? null;
}

const lightRoot = PAGE.slice(PAGE.indexOf(":root {"), PAGE.indexOf("@media (prefers-color-scheme:dark)"));
const darkRoot = PAGE.slice(PAGE.indexOf("@media (prefers-color-scheme:dark)"));
const appDark = APP_CSS.slice(APP_CSS.indexOf('.landing-root[data-theme="dark"],'));

describe("the public render page's inline palette", () => {
	it("reads the light tokens app.css ships", () => {
		for (const [page, app] of TOKENS) {
			const wanted = declared(APP_CSS, app);
			expect(wanted, `${app} in app.css`).not.toBeNull();
			expect(declared(lightRoot, page), `${page} in render-page.ts`).toBe(wanted);
		}
	});

	it("reads the dark tokens app.css ships for the landing", () => {
		for (const [page, app] of [
			["--paper", "--color-paper"],
			["--ink", "--color-ink"],
			["--ash", "--color-ash"],
			["--hairline", "--color-hairline"],
		] as const) {
			const wanted = declared(appDark, app);
			expect(wanted, `${app} in app.css, dark`).not.toBeNull();
			expect(declared(darkRoot, page), `${page} in render-page.ts, dark`).toBe(wanted);
		}
	});

	it("loads Geist from the same file and falls back with the same metrics as the app", () => {
		expect(PAGE).toContain("url(/fonts/Geist-latin.woff2)");
		expect(readFileSync(resolve(__dirname, "../../src/application/fonts/code-fonts.ts"), "utf8")).toContain(
			'"/fonts/Geist-latin.woff2"',
		);
		const metrics = (source: string) =>
			[...source.matchAll(/(?<![\w-])(size-adjust|ascent-override|descent-override|line-gap-override):\s*([^;]+);/g)].map(
				(match) => `${match[1]} ${match[2]}`,
			);
		expect(metrics(PAGE).length).toBe(8);
		expect(metrics(PAGE)).toEqual(metrics(APP_CSS.slice(0, APP_CSS.indexOf("@theme"))));
	});
});
