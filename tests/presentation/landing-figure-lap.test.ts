import { playLapOnce } from "@/presentation/landing/figures/figure-lap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PO decision 2026-10-08 (DECISIONS D8): no looping ambient motion. A figure
 * plays its lap once, the first time it is mostly in view, then rests and only
 * answers a hand; never under reduced motion, never again on re-entry.
 */

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];
	disconnected = false;
	constructor(
		public callback: IntersectionObserverCallback,
		public options?: IntersectionObserverInit,
	) {
		MockIntersectionObserver.instances.push(this);
	}
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {
		this.disconnected = true;
	}
	emit(ratio: number): void {
		this.callback(
			[{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

const STOPS: ([number, number] | null)[] = [[1, 1], [2, 2], [3, 3], null];

function setup(reduced = false) {
	const host = document.createElement("div");
	document.body.append(host);
	const stop = vi.fn();
	let onStop: ((index: number) => void) | undefined;
	const tour = vi.fn((_stage: HTMLElement, _stops: unknown, cb?: (index: number) => void) => {
		onStop = cb;
		return { stop };
	});
	const cancel = playLapOnce({ host, stops: STOPS, tour, reducedMotion: () => reduced });
	const io = () => MockIntersectionObserver.instances.at(-1);
	return { host, tour, stop, cancel, io, arrive: (i: number) => onStop?.(i) };
}

describe("playLapOnce", () => {
	beforeEach(() => {
		MockIntersectionObserver.instances = [];
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.replaceChildren();
	});

	it("waits until the figure is at least 60% in view", () => {
		const { tour, io } = setup();

		expect(io()?.options?.threshold).toBe(0.6);
		io()?.emit(0.3);
		expect(tour).not.toHaveBeenCalled();
		io()?.emit(0.6);
		expect(tour).toHaveBeenCalledTimes(1);
		expect(io()?.disconnected).toBe(true);
	});

	it("ends the lap at its leave, so it never loops", () => {
		const { stop, io, arrive } = setup();
		io()?.emit(1);

		arrive(0);
		arrive(2);
		expect(stop).not.toHaveBeenCalled();
		arrive(3);
		expect(stop).toHaveBeenCalledTimes(1);
	});

	it("hands the figure to a real hand for good", () => {
		const { host, stop, io } = setup();
		io()?.emit(1);

		host.dispatchEvent(new Event("pointerdown"));
		expect(stop).toHaveBeenCalledTimes(1);
	});

	it("never plays under reduced motion", () => {
		const { tour, io } = setup(true);
		io()?.emit(1);

		expect(tour).not.toHaveBeenCalled();
	});

	it("never plays on re-entry, and cancels cleanly", () => {
		const { tour, io, cancel, stop } = setup();
		io()?.emit(1);
		io()?.emit(0);
		io()?.emit(1);
		expect(tour).toHaveBeenCalledTimes(1);

		cancel();
		expect(stop).toHaveBeenCalled();
	});
});
