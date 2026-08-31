import { CYCLE_PLATFORMS, usePlatformCycle } from "@/presentation/landing/iphone-showcase";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The chip row is a spatial map of the cycle, so picking a chip has to move the
 * cycle to it: the same fact the phone already reads, reached by pointer and
 * keyboard instead of only by swipe and clock.
 */
describe("usePlatformCycle select", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("moves the cycle to the chosen index", () => {
		const { result } = renderHook(() => usePlatformCycle());

		act(() => result.current.controls.select(3));

		expect(result.current.index).toBe(3);
		expect(result.current.platform).toBe(CYCLE_PLATFORMS[3]);
	});

	/** The row reads left to right, so a chip further along arrives from that side. */
	it("takes its direction from where the chip sits in the row", () => {
		const { result } = renderHook(() => usePlatformCycle());

		act(() => result.current.controls.select(2));
		expect(result.current.direction).toBe(1);

		act(() => result.current.controls.select(1));
		expect(result.current.direction).toBe(-1);
	});

	it("ignores a pick that is already on screen, leaving the direction alone", () => {
		const { result } = renderHook(() => usePlatformCycle());

		act(() => result.current.controls.select(2));
		const settled = result.current.direction;

		act(() => result.current.controls.select(2));

		expect(result.current.index).toBe(2);
		expect(result.current.direction).toBe(settled);
	});

	it("ignores an index outside the cycle", () => {
		const { result } = renderHook(() => usePlatformCycle());

		act(() => result.current.controls.select(CYCLE_PLATFORMS.length));
		act(() => result.current.controls.select(-1));

		expect(result.current.index).toBe(0);
	});

	/** Marketing motion maps to the visitor's input: the showcase is a picker,
	 * not an auto-advancing carousel competing with the rest of the page. */
	it("never advances until the visitor picks or swipes", () => {
		const { result } = renderHook(() => usePlatformCycle());

		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(result.current.index).toBe(0);

		act(() => result.current.controls.select(4));
		expect(result.current.index).toBe(4);

		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(result.current.index).toBe(4);
	});
});
