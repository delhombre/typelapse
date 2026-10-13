import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountFigure, placeInk } from "@/presentation/landing/figures/mount-figure";
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

		const destroy = mountFigure(figure, host, (text) => {
			out.textContent = text;
		});

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
		expect(host.querySelector("[data-hairline]")).toBeNull();
	});

	/* Review of #248: the kernel's one frame loop must stop once the last figure
	   is gone, and a figure that throws while mounting must leave nothing. */
	it("stops the kernel's frame loop after the last figure is destroyed", async () => {
		const frames = vi.fn(() => 1);
		const cancels = vi.fn();
		vi.stubGlobal("requestAnimationFrame", frames);
		vi.stubGlobal("cancelAnimationFrame", cancels);
		const disconnects = vi.fn();
		vi.stubGlobal(
			"IntersectionObserver",
			class {
				observe(): void {}
				unobserve(): void {}
				disconnect = disconnects;
			},
		);
		const box = document.createElement("div");
		document.body.append(box);
		const destroyAll = await Promise.all(
			FIGURES.map(async (name) => mountFigure(await load(name), box, () => undefined)),
		);

		for (const destroy of destroyAll) {
			destroy();
		}

		// The loop's observer is let go only when no board is left.
		expect(disconnects).toHaveBeenCalled();
		expect(box.querySelector("[data-hairline]")).toBeNull();
	});

	it("leaves nothing behind when a figure throws while mounting", () => {
		const box = document.createElement("div");
		document.body.append(box);
		const broken: HairlineFigureDef = {
			name: "broken",
			means: "A figure that throws.",
			rules: [1],
			range: [0, 1, 2],
			tour: null,
			mount: () => {
				throw new Error("no");
			},
		};

		expect(() => mountFigure(broken, box, () => undefined)).toThrow("no");
		expect(box.children).toHaveLength(0);
	});

	it("places the rest ink on one baseline, at most 340 wide and 232 tall, centred", () => {
		const wide = placeInk({ x: 50, y: 80, width: 300, height: 150 });
		expect(wide.scale).toBeCloseTo(340 / 300);
		expect(wide.x + wide.scale * (50 + 150)).toBeCloseTo(200);
		expect(wide.y + wide.scale * (80 + 150)).toBeCloseTo(244);

		const tall = placeInk({ x: 60, y: 30, width: 280, height: 260 });
		expect(tall.scale).toBeCloseTo(232 / 260);
		expect(tall.y + tall.scale * (30 + 260)).toBeCloseTo(244);
	});

	/* One visual system across the five: one camera, a scale family that keeps
	   every rest pose 290 to 306 viewBox units wide (measured by the skill's look
	   check; `placeInk` normalises them on the page), one stagger rhythm, and a lap that ends by leaving. */
	it("draws the five as one system: one camera, one rhythm, a lap each", async () => {
		const scales: number[] = [];
		for (const name of FIGURES) {
			const source = readFileSync(
				resolve(__dirname, `../../src/presentation/landing/figures/${name}.ts`),
				"utf8",
			);
			const cameras = [...source.matchAll(/Cam\((\d+), ([\d.]+), ([\d.]+)\)/g)];
			expect(cameras, name).toHaveLength(1);
			expect(cameras[0]?.slice(1, 3), name).toEqual(["45", "0.5"]);
			scales.push(Number(cameras[0]?.[3]));

			const figure = await load(name);
			const stops = figure.tour ?? [];
			expect(stops.length, name).toBeGreaterThanOrEqual(4);
			expect(stops.at(-1), name).toBeNull();
		}
		expect(Math.min(...scales)).toBeGreaterThanOrEqual(1.42);
		expect(Math.max(...scales)).toBeLessThanOrEqual(2.16);

		const staggered = await Promise.all(["scenes", "local", "queue"].map((n) => load(n as never)));
		expect(new Set(staggered.map((f) => f.range.join()))).toEqual(new Set(["0,40,90"]));
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
