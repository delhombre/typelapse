import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountFigure } from "@/presentation/landing/figures/mount-figure";
import type { HairlineFigureDef } from "@/presentation/landing/figures/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The five Typelapse figures, mounted on the real kernel: each draws its rest
 * pose with something bright to start from, says "rest", and leaves nothing
 * behind when destroyed. jsdom has no layout, so this is the lifecycle, not
 * the look; the look is the hairline validator's and the screenshots'.
 */

class QuietIntersectionObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

const FIGURES = ["scenes", "glide", "safezone", "local", "queue"] as const;

async function load(name: (typeof FIGURES)[number]): Promise<HairlineFigureDef> {
	const module = await import(`@/presentation/landing/figures/${name}.ts`);
	return module.default as HairlineFigureDef;
}

describe("the landing's hairline figures", () => {
	beforeEach(() => {
		vi.stubGlobal("IntersectionObserver", QuietIntersectionObserver);
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.replaceChildren();
	});

	it.each(FIGURES)("%s draws a composed rest, then tears down to nothing", async (name) => {
		const figure = await load(name);
		const host = document.createElement("div");
		const out = document.createElement("span");
		document.body.append(host, out);

		const destroy = mountFigure(figure, host, out);

		expect(figure.name).toBe(name);
		expect(figure.means.length).toBeLessThanOrEqual(140);
		expect(out.textContent).toBe("rest");
		const svg = host.querySelector("svg");
		expect(svg?.querySelectorAll("path").length).toBeGreaterThan(3);
		// One bright mark at rest says where the eye starts (rule 04).
		expect(svg?.querySelector(".hi, .dot:not(.m):not(.off)")).not.toBeNull();
		// No words inside the drawing (rule 10).
		expect(svg?.querySelector("text")).toBeNull();

		destroy();

		expect(host.querySelector("svg")).toBeNull();
		expect(host.hasAttribute("data-hairline")).toBe(false);
	});

	it("keeps the kernel verbatim under its MIT notice, with one export added", () => {
		const kernel = readFileSync(
			resolve(__dirname, "../../src/presentation/landing/figures/kernel.js"),
			"utf8",
		);

		expect(kernel).toMatch(/MIT License\s+\*\s+\*\s+Copyright \(c\) 2026 Lucas Marques/);
		expect(kernel).toContain("/* hairline kernel sha256:");
		expect(kernel.trimEnd().endsWith("/* /hairline kernel */\nexport default HL;")).toBe(true);
	});
});
