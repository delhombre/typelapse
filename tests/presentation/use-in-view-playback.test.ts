import { useInViewPlayback } from "@/presentation/hooks/use-in-view-playback";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contract the landing's animation loops depend on: report visible until an
 * observer says otherwise (a loop must never stay dead where there is no
 * IntersectionObserver), then follow the element in and out of the viewport, and
 * disconnect on unmount so a scrolled-away section stops costing anything.
 *
 * Mirrors the mock-observer shape already used by use-resize-observer.test.ts.
 */

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];
	observed: Element[] = [];
	disconnects = 0;

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
		this.disconnects += 1;
	}

	/** Deliver an intersection the way the browser would. */
	emit(isIntersecting: boolean): void {
		this.callback(
			[{ isIntersecting } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

const latest = () => MockIntersectionObserver.instances.at(-1);

describe("useInViewPlayback", () => {
	beforeEach(() => {
		MockIntersectionObserver.instances = [];
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reports visible before any observation, so playback never starts dead", () => {
		const { result } = renderHook(() => useInViewPlayback());
		expect(result.current.inView).toBe(true);
		expect(MockIntersectionObserver.instances).toHaveLength(0);
	});

	it("observes the element with a resume margin ahead of the viewport", () => {
		const { result } = renderHook(() => useInViewPlayback<HTMLDivElement>());
		const el = document.createElement("div");
		act(() => result.current.ref(el));

		expect(latest()?.observed).toEqual([el]);
		expect(latest()?.options).toMatchObject({ rootMargin: "100px", threshold: 0 });
	});

	it("suspends when the element leaves and resumes when it comes back", () => {
		const { result } = renderHook(() => useInViewPlayback<HTMLDivElement>());
		act(() => result.current.ref(document.createElement("div")));

		act(() => latest()?.emit(false));
		expect(result.current.inView).toBe(false);

		act(() => latest()?.emit(true));
		expect(result.current.inView).toBe(true);
	});

	it("disconnects on unmount", () => {
		const { result, unmount } = renderHook(() => useInViewPlayback<HTMLDivElement>());
		act(() => result.current.ref(document.createElement("div")));

		unmount();
		expect(latest()?.disconnects).toBe(1);
	});

	it("stays visible where there is no IntersectionObserver (SSR, old browsers)", () => {
		vi.stubGlobal("IntersectionObserver", undefined);
		const { result } = renderHook(() => useInViewPlayback<HTMLDivElement>());
		act(() => result.current.ref(document.createElement("div")));

		expect(result.current.inView).toBe(true);
	});
});
