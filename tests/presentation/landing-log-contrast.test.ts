// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The hero's commit log sets its counts at 12px. They were a 70% mix of ash:
 * 2.81:1 on the light paper, 4.24:1 on the dark. The floor for text this small
 * is WCAG's 4.5:1, so the rule has to land on a colour that clears it in both
 * themes, measured here from the tokens the stylesheet declares.
 */

const CSS = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");

type Rgb = readonly [number, number, number];

function hex(value: string): Rgb {
	return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as unknown as Rgb;
}

function luminance([r, g, b]: Rgb): number {
	const [lr, lg, lb] = [r, g, b].map((channel) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as unknown as Rgb;
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

/** The token as a block declares it: the first block whose selector matches. */
function token(selector: RegExp, name: string): Rgb {
	const block = CSS.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
	const value = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
	expect(value, `${selector} should declare --color-${name}`).toBeDefined();
	return hex(value as string);
}

function logCountRule(): string {
	const rule = CSS.match(/\.landing-root \.lp-log span \{([^}]*)\}/)?.[1];
	expect(rule, "app.css should style the log's counts").toBeDefined();
	return rule as string;
}

describe("the hero log's counts", () => {
	it("are set in ash itself, not a translucent mix of it", () => {
		expect(logCountRule()).toMatch(/color:\s*var\(--color-ash\);/);
	});

	it("clear 4.5:1 on the light paper", () => {
		const ratio = contrast(token(/@theme/, "ash"), token(/@theme/, "paper"));

		expect(ratio).toBeGreaterThanOrEqual(4.5);
	});

	it("clear 4.5:1 on the dark paper", () => {
		const dark = /\.landing-root\[data-theme="dark"\],\s*\.dark \.route-state/;

		// The dark paper is declared once, for the landing, the route states and the studio's document.
		const paper = /html\[data-landing-theme="dark"\],\s*html\.dark:not\(\[data-landing-theme\]\)/;

		expect(contrast(token(dark, "ash"), token(paper, "paper"))).toBeGreaterThanOrEqual(4.5);
	});
});
