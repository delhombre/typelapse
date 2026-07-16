import { useResizeObserverNode } from "@/presentation/hooks/use-resize-observer";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the fit-to-viewport bug: LivePreview's first render is a
 * placeholder (plan still building), so the measured elements mount LATER. A
 * RefObject-based observer hook runs its effect once with `.current === null`
 * and never retries: no observer is ever attached and the fit scale stays 1.
 * The node-based variant must attach the moment the element actually appears.
 */

class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	observed: Element[] = [];
	disconnects = 0;

	constructor(public callback: ResizeObserverCallback) {
		MockResizeObserver.instances.push(this);
	}

	observe(el: Element): void {
		this.observed.push(el);
	}

	unobserve(): void {}

	disconnect(): void {
		this.disconnects += 1;
	}
}

function allObserved(): Element[] {
	return MockResizeObserver.instances.flatMap((i) => i.observed);
}

describe("useResizeObserverNode", () => {
	beforeEach(() => {
		MockResizeObserver.instances = [];
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("attaches no observer while the node is null", () => {
		renderHook((node: Element | null) => useResizeObserverNode(node), {
			initialProps: null as Element | null,
		});
		expect(allObserved()).toHaveLength(0);
	});

	it("observes a node that arrives AFTER the first render (the regression)", () => {
		const { rerender } = renderHook((node: Element | null) => useResizeObserverNode(node), {
			initialProps: null as Element | null,
		});
		expect(allObserved()).toHaveLength(0);

		// The real UI mounts on a later render: exactly what a RefObject misses.
		const el = document.createElement("div");
		rerender(el);

		expect(allObserved()).toHaveLength(1);
		expect(allObserved()[0]).toBe(el);
	});

	it("disconnects the old observer when the node changes, and observes the new one", () => {
		const first = document.createElement("div");
		const { rerender } = renderHook((node: Element | null) => useResizeObserverNode(node), {
			initialProps: first as Element | null,
		});
		const firstObserver = MockResizeObserver.instances[0];
		expect(firstObserver?.observed).toEqual([first]);

		const second = document.createElement("div");
		rerender(second);

		expect(firstObserver?.disconnects).toBe(1);
		expect(allObserved()).toEqual([first, second]);
	});

	it("disconnects on unmount", () => {
		const el = document.createElement("div");
		const { unmount } = renderHook((node: Element | null) => useResizeObserverNode(node), {
			initialProps: el as Element | null,
		});
		unmount();
		expect(MockResizeObserver.instances[0]?.disconnects).toBe(1);
	});
});
