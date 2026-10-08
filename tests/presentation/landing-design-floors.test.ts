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

	/* The import mock that held text over glass is gone (2026-10-08): the stage
	   shows a capture of the studio. Nothing on the landing is glass. */
	it("keeps glass off every landing surface", () => {
		const glass = landingRules().filter(([, body]) => /backdrop-filter/.test(body));
		expect(glass.map(([selector]) => selector)).toEqual([]);
	});

	it("reads no literal for the primary or the code surface", () => {
		expect(CSS).not.toMatch(/#f5c400/i);
		expect(rule(".landing-root .lp-morph-frame")).not.toMatch(/background:\s*#/);
	});

	/* The chips left the band for the paper with the pipeline (2026-10-08). The
	   unselected ones are ash itself, never a mix of it, and ash clears 4.5:1 on
	   both papers; the selected one is ink, never the primary, which is 1.67:1. */
	it("keeps the social chips at ash and ink on the paper, over 4.5:1 in both themes", () => {
		const source = readFileSync(
			resolve(__dirname, "../../src/presentation/landing/social-section.tsx"),
			"utf8",
		);
		expect(source).toMatch(/"border-hairline bg-transparent text-ash /);
		expect(source).toMatch(/"border-ink\/25 bg-surface text-ink"/);
		expect(source).not.toMatch(/text-\[var\(--color-primary\)\]/);

		const lin = (c: number) => {
			const s = c / 255;
			return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		};
		const lum = ([r = 0, g = 0, b = 0]: number[]) =>
			0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
		for (const [ash, paper] of [
			[
				[0x6e, 0x6b, 0x64],
				[0xfa, 0xf9, 0xf6],
			],
			[
				[0xa8, 0xa3, 0x9a],
				[0x12, 0x11, 0x10],
			],
		] as const) {
			const [hi, lo] = [lum([...ash]), lum([...paper])].sort((a, b) => b - a) as [number, number];

			expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("draws the figures in the page's own ink and paper, never the primary", () => {
		for (const token of ["hi", "edge", "mid", "lo", "plate"]) {
			const declared = [...CSS.matchAll(new RegExp(`--hairline-${token}:\\s*([^;]+);`, "g"))].map(
				(m) => m[1] ?? "",
			);
			expect(declared.length, `--hairline-${token}`).toBeGreaterThan(0);
			for (const value of declared) {
				expect(value).toMatch(/var\(--color-(ink|paper)\)/);
				expect(value).not.toMatch(/primary|#/);
			}
		}
	});
});
