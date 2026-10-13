import { DynamicNav } from "@/presentation/landing/dynamic-nav";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The nav's section links say which section is in view with `aria-current`, the
 * way a header's current page does for a reader who cannot see the pill's place
 * on the page. A section is "in view" when it crosses the line the observer
 * watches, so exactly one is current at a time and none while the hero is.
 */

interface FakeObserver {
	callback: IntersectionObserverCallback;
	options: IntersectionObserverInit | undefined;
	targets: Element[];
}

const observers: FakeObserver[] = [];
const original = globalThis.IntersectionObserver;

beforeEach(() => {
	observers.length = 0;
	globalThis.IntersectionObserver = class {
		private readonly record: FakeObserver;
		constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
			this.record = { callback, options, targets: [] };
			observers.push(this.record);
		}
		observe(target: Element) {
			this.record.targets.push(target);
		}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof IntersectionObserver;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	for (const id of ["how-it-works", "proof", "pricing"]) {
		const section = document.createElement("section");
		section.id = id;
		document.body.append(section);
	}
});

afterEach(() => {
	cleanup();
	globalThis.IntersectionObserver = original;
	document.body.replaceChildren();
});

function crossing(id: string, isIntersecting: boolean) {
	const observer = observers.find((o) => o.targets.some((t) => t.id === id));
	const target = observer?.targets.find((t) => t.id === id);
	if (!observer || !target) {
		throw new Error(`no observer watches #${id}`);
	}
	act(() => {
		observer.callback(
			[{ target, isIntersecting } as IntersectionObserverEntry],
			observer as unknown as IntersectionObserver,
		);
	});
}

function renderNav() {
	return render(
		<MemoryRouter>
			<DynamicNav />
		</MemoryRouter>,
	);
}

const link = (name: string) => screen.getByRole("link", { name, hidden: true });

describe("landing nav, the section in view", () => {
	it("marks no section while none is on the watched line", () => {
		renderNav();

		for (const name of ["How it works", "Proof", "Pricing"]) {
			expect(link(name).getAttribute("aria-current")).toBeNull();
		}
	});

	it("marks the section that crosses the line, and only that one", () => {
		renderNav();

		crossing("how-it-works", true);
		expect(link("How it works").getAttribute("aria-current")).toBe("location");
		expect(link("Proof").getAttribute("aria-current")).toBeNull();

		crossing("how-it-works", false);
		crossing("proof", true);
		expect(link("How it works").getAttribute("aria-current")).toBeNull();
		expect(link("Proof").getAttribute("aria-current")).toBe("location");
	});

	it("lets go of the mark when the section leaves and nothing replaces it", () => {
		renderNav();

		crossing("pricing", true);
		crossing("pricing", false);

		expect(link("Pricing").getAttribute("aria-current")).toBeNull();
	});

	it("watches a thin band across the middle of the viewport, not the whole of it", () => {
		renderNav();
		const watching = observers.find((o) => o.targets.some((t) => t.id === "proof"));

		expect(watching?.options?.rootMargin).toBe("-45% 0px -54% 0px");
	});
});
