// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The floors the 2026-10-08 design audit measured the landing against, read from
 * the stylesheet: nothing on the landing sets text under 11px, the placeholder is
 * ash itself, the inactive social chips clear 4.5:1 on the band, and nothing that
 * holds text in a mock is glass.
 */

/** Comments out: a rule's selector is what stands between two closing braces. */
const CSS = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8").replace(
	/\/\*[\s\S]*?\*\//g,
	"",
);

/** Every top-level rule whose selector mentions the landing, as [selector, body]. */
function landingRules(): [string, string][] {
	const rules: [string, string][] = [];
	for (const match of CSS.matchAll(/(^|\n)([^@{}\n][^{}]*)\{([^{}]*)\}/g)) {
		const selector = (match[2] ?? "").trim();
		if (selector.includes(".landing-root")) {
			rules.push([selector, match[3] ?? ""]);
		}
	}
	return rules;
}

function rule(selector: string): string {
	const found = landingRules().find(([s]) => s === selector);
	expect(found, `${selector} should be styled`).toBeDefined();
	return found?.[1] ?? "";
}

function px(value: string): number {
	const n = Number.parseFloat(value);
	return value.endsWith("rem") ? n * 16 : n;
}

describe("landing type floor", () => {
	it("sets no text under 11px in a landing rule", () => {
		const under = landingRules().flatMap(([selector, body]) =>
			[...body.matchAll(/(?:^|[;\s])font-size:\s*([\d.]+(?:px|rem))/g)]
				.map((m) => [selector, m[1] ?? ""] as const)
				.filter(([, size]) => px(size) < 11),
		);

		expect(under).toEqual([]);
	});

	it("sets the eyebrow at 12px", () => {
		const size = rule(".landing-root .lp-eyebrow").match(/font-size:\s*([\d.]+rem)/)?.[1];

		expect(px(size ?? "0")).toBe(12);
	});

	it("writes the hero's leading as a ratio, so it follows the size", () => {
		for (const selector of [".landing-root .lp-log", ".landing-root .lp-hero-meta"]) {
			expect(rule(selector), selector).not.toMatch(/line-height:\s*[\d.]+px/);
		}
	});
});

describe("landing colour", () => {
	it("sets the placeholder in ash itself, not a translucent mix of it", () => {
		expect(rule(".landing-root .lp-field textarea::placeholder")).toMatch(
			/color:\s*var\(--color-ash\);/,
		);
	});

	it("keeps glass off every surface that holds text in a mock", () => {
		for (const selector of [
			".landing-root .lp-import-source-island",
			".landing-root .lp-import-ready",
		]) {
			expect(rule(selector), selector).not.toMatch(/backdrop-filter/);
		}
	});

	it("reads no literal for the primary or the code surface", () => {
		expect(CSS).not.toMatch(/#f5c400/i);
		expect(rule(".landing-root .lp-morph-frame")).not.toMatch(/background:\s*#/);
	});

	it("keeps the unselected social chips over 4.5:1 on the band, in both themes", () => {
		const alpha = 0.65;
		const ink = [0xf5, 0xf3, 0xef];
		const lin = (c: number) => {
			const s = c / 255;
			return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		};
		const lum = ([r = 0, g = 0, b = 0]: number[]) =>
			0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
		for (const band of [
			[0x17, 0x16, 0x14],
			[0x1c, 0x1a, 0x18],
		]) {
			const fg = ink.map((c, i) => Math.round(c * alpha + (band[i] ?? 0) * (1 - alpha)));
			const [hi, lo] = [lum(fg), lum(band)].sort((a, b) => b - a) as [number, number];

			expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
		}
	});
});
