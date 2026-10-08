import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DynamicNav } from "@/presentation/landing/dynamic-nav";
import { CYCLE_PLATFORMS } from "@/presentation/landing/iphone-showcase";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

function renderNav() {
	return render(
		<MemoryRouter>
			<DynamicNav />
		</MemoryRouter>,
	);
}

describe("landing nav pill", () => {
	it("is the island's plate: it reads the dock, and never branches on what is under it", () => {
		const { container } = renderNav();
		const pill = container.querySelector(".lp-nav-pill");
		expect(pill, "the pill wears the plate class").not.toBeNull();

		// It used to flip to paper over the dark band, and the brand and the capsule
		// went with it: 1.05:1 on the dark theme. The ink is the dock's, in one
		// place, so no utility colour is left to invert.
		const brand = screen.getByRole("link", { name: "Typelapse home", hidden: true });
		expect(brand.className).not.toMatch(/text-(white|ink|paper)/);
		expect(pill?.getAttribute("style") ?? "").not.toMatch(/background|box-shadow/);
	});

	it("keeps the primary for its call to action on every backdrop", () => {
		renderNav();
		const cta = screen.getByRole("link", { name: "Open studio", hidden: true }).firstElementChild;

		expect(cta?.className).toContain("bg-[var(--color-cta)]");
		expect(cta?.className).not.toMatch(/bg-ink|text-paper/);
	});

	it("clears the notch", () => {
		const { container } = renderNav();

		expect(container.querySelector("header")?.className).toContain(
			"top-[max(12px,env(safe-area-inset-top))]",
		);
	});
});

describe("landing nav over the hero", () => {
	/* Review of #248: "Open studio" is said once in the first screen, by the
	   hero's field. The pill carries its links there, and its CTA once the hero
	   has gone. */
	it("holds its CTA back while the hero is in view, and shows it once it has gone", () => {
		const observers: IntersectionObserverCallback[] = [];
		const original = globalThis.IntersectionObserver;
		globalThis.IntersectionObserver = class {
			constructor(callback: IntersectionObserverCallback) {
				observers.push(callback);
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof IntersectionObserver;
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
		const hero = document.createElement("section");
		hero.className = "lp-hero";
		document.body.append(hero);
		try {
			const { container } = renderNav();
			const cta = () => screen.queryByRole("link", { name: "Open studio" });
			const say = (isIntersecting: boolean) =>
				act(() =>
					observers[0]?.(
						[{ isIntersecting } as IntersectionObserverEntry],
						{} as IntersectionObserver,
					),
				);

			expect(cta()).toBeNull();
			expect(container.querySelector(".lp-nav-pill")?.hasAttribute("data-over-hero")).toBe(true);
			expect(screen.getByRole("navigation", { name: "Sections", hidden: true })).toBeTruthy();
			say(false);
			expect(cta()).not.toBeNull();
		} finally {
			hero.remove();
			globalThis.IntersectionObserver = original;
		}
	});
});

describe("landing theme toggle over the dark band", () => {
	it("reads the band's own ink, which paper is not on the dark theme", () => {
		// The over-the-band state needs a dark section under it to render, so the
		// source is what is read: paper is #121110 on the dark theme (1.07:1).
		const source = readFileSync(
			resolve(__dirname, "../../src/presentation/landing/theme-toggle.tsx"),
			"utf8",
		);

		expect(source).toContain("text-band-ink/75");
		expect(source).not.toMatch(/text-paper|bg-paper/);
	});
});

describe("platform chips", () => {
	it("run in the order the section's sentence names them", () => {
		expect(CYCLE_PLATFORMS).toEqual(["tiktok", "reels", "shorts", "x", "linkedin"]);
	});
});
