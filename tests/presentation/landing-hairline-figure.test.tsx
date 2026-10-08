import { HairlineFigure } from "@/presentation/landing/figures/hairline-figure";
import type { FigureContext, HairlineFigureDef } from "@/presentation/landing/figures/types";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The landing's figures cost nothing until they are about to be seen: the
 * figure and its kernel are fetched and drawn when the stage nears the
 * viewport, once, and torn down with the page. The stage is an image to a
 * screen reader from the first paint, and the read-out lives in the caption.
 */

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];
	observed: Element[] = [];
	disconnected = false;

	constructor(
		public callback: IntersectionObserverCallback,
		public options?: IntersectionObserverInit,
	) {
		MockIntersectionObserver.instances.push(this);
	}

	observe(el: Element): void {
		this.observed.push(el);
	}

	unobserve(): void {}

	disconnect(): void {
		this.disconnected = true;
	}

	emit(isIntersecting: boolean): void {
		this.callback(
			[{ isIntersecting } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

/** The observer watching the figure itself, not one the kernel opened for its loop. */
const nearness = () =>
	MockIntersectionObserver.instances.find((o) => o.observed.some((el) => el.tagName === "FIGURE"));

function fakeFigure() {
	const destroy = vi.fn();
	const mount = vi.fn((context: FigureContext, _value: number) => {
		context.svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
		context.read.textContent = "rest";
		return { set: vi.fn(), destroy };
	});
	const def: HairlineFigureDef = {
		name: "fake",
		means: "A fake figure.",
		rules: [1],
		range: [10, 30, 50],
		tour: null,
		mount,
	};
	const load = vi.fn(async () => ({ default: def }));
	return { def, load, mount, destroy };
}

function renderFigure(load: () => Promise<{ default: HairlineFigureDef }>) {
	return render(
		<HairlineFigure load={load} label="A pull request cut into scenes." hint="Move over it" />,
	);
}

describe("HairlineFigure", () => {
	beforeEach(() => {
		MockIntersectionObserver.instances = [];
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("is an image with its label from the first paint, resting until drawn", () => {
		const { load } = fakeFigure();
		renderFigure(load);

		expect(screen.getByRole("img", { name: "A pull request cut into scenes." })).toBeTruthy();
		// At rest the one line under it says what to do with it, never a bare "rest".
		const read = screen.getByText("Move over it");
		expect(read.getAttribute("data-state")).toBe("rest");
		expect(screen.queryByText("rest")).toBeNull();
	});

	/* Review of #248, P1.1: a live read-out spoke every frame of a lap (75 writes
	   for the morph). The image and its label are what a screen reader meets. */
	it("is no tab stop, and its line under it is never read out", () => {
		const { load } = fakeFigure();
		const { container } = renderFigure(load);
		const stage = screen.getByRole("img");

		expect(stage.hasAttribute("tabindex")).toBe(false);
		expect(container.querySelector("[aria-live]")).toBeNull();
		expect(container.querySelector("figcaption")?.getAttribute("aria-hidden")).toBe("true");
	});

	it("fetches nothing until the stage nears the viewport", () => {
		const { load } = fakeFigure();
		renderFigure(load);

		expect(load).not.toHaveBeenCalled();
		expect(nearness()?.options?.rootMargin).toMatch(/px/);
	});

	it("draws once when near, then stops watching", async () => {
		const { load, mount } = fakeFigure();
		const { container } = renderFigure(load);

		act(() => nearness()?.emit(true));
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));

		expect(load).toHaveBeenCalledTimes(1);
		expect(nearness()?.disconnected).toBe(true);
		const stage = screen.getByRole("img");
		const host = stage.querySelector("[data-hairline]");
		expect(host?.getAttribute("data-hairline")).toBe("fake");
		expect(host?.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 400 320");
		expect(host?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
		// Mounted on a host of its own inside the box, at intensity 0.4: four fifths
		// of the way to the default.
		expect(mount.mock.calls[0]?.[0].stage).toBe(host);
		expect(mount.mock.calls[0]?.[1]).toBe(26);
		expect(container.querySelectorAll("svg")).toHaveLength(1);
	});

	it("writes what the figure reads out into the caption", async () => {
		const { load, mount } = fakeFigure();
		renderFigure(load);

		act(() => nearness()?.emit(true));
		await waitFor(() => expect(mount).toHaveBeenCalled());
		const read = mount.mock.calls[0]?.[0].read;
		act(() => {
			if (read) {
				read.textContent = "scene 03";
			}
		});

		expect(screen.getByText("scene 03").getAttribute("data-state")).toBe("live");
		act(() => {
			if (read) {
				read.textContent = "rest";
			}
		});
		expect(screen.getByText("Move over it").getAttribute("data-state")).toBe("rest");
	});

	it("ignores an observation that is not an intersection", () => {
		const { load } = fakeFigure();
		renderFigure(load);

		act(() => nearness()?.emit(false));

		expect(load).not.toHaveBeenCalled();
	});

	it("destroys the figure and leaves no drawing when the page goes", async () => {
		const { load, mount, destroy } = fakeFigure();
		const { unmount, container } = renderFigure(load);
		act(() => nearness()?.emit(true));
		await waitFor(() => expect(mount).toHaveBeenCalled());

		unmount();

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(container.querySelector("svg")).toBeNull();
	});

	it("never draws a figure whose page left while it was loading", async () => {
		const { load, mount } = fakeFigure();
		const { unmount } = renderFigure(load);

		act(() => nearness()?.emit(true));
		unmount();
		await act(async () => {
			await load.mock.results[0]?.value;
			await Promise.resolve();
		});

		expect(mount).not.toHaveBeenCalled();
		expect(nearness()?.disconnected).toBe(true);
	});

	it("draws at once where there is no observer to wait on", async () => {
		vi.stubGlobal("IntersectionObserver", undefined);
		const { load, mount } = fakeFigure();
		renderFigure(load);

		await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
	});
});
