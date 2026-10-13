import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DynamicNav, NAV_TUCK_MS } from "@/presentation/landing/dynamic-nav";
import { CYCLE_PLATFORMS } from "@/presentation/landing/iphone-showcase";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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
		const { container } = renderNav();
		// Held in the markup (hidden over the hero), so its fill is read off the element.
		const cta = container.querySelector('a[href="/app"]')?.firstElementChild;

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
	   hero's field, so the pill holds its CTA back there. Round 3: the pill
	   never changes width where it can be seen (CLS 0, no hole, no jump). When
	   the hero comes or goes with the pill on screen, it tucks away, takes or
	   drops its CTA out of sight, and comes back. */
	it("takes and drops its CTA only while it is tucked out of sight", () => {
		vi.useFakeTimers();
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
			const pill = () => container.querySelector(".lp-nav-pill");
			const link = () => container.querySelector('a[href="/app"]');
			const tucked = () => pill()?.getAttribute("aria-hidden") === "true";
			const say = (isIntersecting: boolean) =>
				act(() =>
					observers[0]?.(
						[{ isIntersecting } as IntersectionObserverEntry],
						{} as IntersectionObserver,
					),
				);
			const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

			// Over the hero: the links, no CTA, the pill in view.
			expect(link()?.hasAttribute("hidden")).toBe(true);
			expect(tucked()).toBe(false);
			expect(screen.getByRole("navigation", { name: "Sections", hidden: true })).toBeTruthy();

			// The hero goes: the pill tucks first, still without its CTA...
			say(false);
			expect(tucked()).toBe(true);
			expect(link()?.hasAttribute("hidden")).toBe(true);
			// ...takes it out of sight, then comes back with it.
			wait(NAV_TUCK_MS);
			expect(link()?.hasAttribute("hidden")).toBe(false);
			expect(tucked()).toBe(true);
			wait(100);
			expect(tucked()).toBe(false);
			expect(screen.queryByRole("link", { name: "Open studio" })).not.toBeNull();

			// Back up into the hero: the same, the other way.
			say(true);
			expect(tucked()).toBe(true);
			expect(link()?.hasAttribute("hidden")).toBe(false);
			wait(NAV_TUCK_MS);
			wait(100);
			expect(link()?.hasAttribute("hidden")).toBe(true);
			expect(tucked()).toBe(false);
		} finally {
			hero.remove();
			globalThis.IntersectionObserver = original;
			vi.useRealTimers();
		}
	});
});

describe("a page with no hero but a zone with its own filled action", () => {
	/* #256 review: the pricing page's plan cards hold "Get ..." in the first screen,
	   so the pill's "Open studio" waits for them to leave, by the landing's rule. */
	it("holds its CTA back while the named zone is in view, and takes it once it is not", () => {
		vi.useFakeTimers();
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
		const zone = document.createElement("div");
		zone.className = "pr-plans";
		document.body.append(zone);
		try {
			const { container } = render(
				<MemoryRouter>
					<DynamicNav deferCtaTo=".pr-plans" />
				</MemoryRouter>,
			);
			const link = () => container.querySelector('a[href="/app"]');
			expect(link()?.hasAttribute("hidden")).toBe(true);
			act(() =>
				observers[0]?.(
					[{ isIntersecting: false } as IntersectionObserverEntry],
					{} as IntersectionObserver,
				),
			);
			act(() => vi.advanceTimersByTime(NAV_TUCK_MS));
			expect(link()?.hasAttribute("hidden")).toBe(false);
		} finally {
			zone.remove();
			globalThis.IntersectionObserver = original;
			vi.useRealTimers();
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
