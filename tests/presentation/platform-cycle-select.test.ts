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
		const { result } = renderHook(() => usePlatformCycle(true));

		act(() => result.current.controls.select(3));

		expect(result.current.index).toBe(3);
		expect(result.current.platform).toBe(CYCLE_PLATFORMS[3]);
	});

	/** The row reads left to right, so a chip further along arrives from that side. */
	it("takes its direction from where the chip sits in the row", () => {
		const { result } = renderHook(() => usePlatformCycle(true));

		act(() => result.current.controls.select(2));
		expect(result.current.direction).toBe(1);

		act(() => result.current.controls.select(1));
		expect(result.current.direction).toBe(-1);
	});

	it("ignores a pick that is already on screen, leaving the direction alone", () => {
		const { result } = renderHook(() => usePlatformCycle(true));

		act(() => result.current.controls.select(2));
		const settled = result.current.direction;

		act(() => result.current.controls.select(2));

		expect(result.current.index).toBe(2);
		expect(result.current.direction).toBe(settled);
	});

	it("ignores an index outside the cycle", () => {
		const { result } = renderHook(() => usePlatformCycle(true));

		act(() => result.current.controls.select(CYCLE_PLATFORMS.length));
		act(() => result.current.controls.select(-1));

		expect(result.current.index).toBe(0);
	});

	/**
	 * The hand outranks the clock, the same rule a swipe already gets: a hold
	 * that has nearly run must not fire moments after a deliberate pick and move
	 * the feed off the platform the visitor just asked for.
	 */
	it("restarts the hold, so the clock never lands on top of a pick", () => {
		const { result } = renderHook(() => usePlatformCycle(true));

		// Let the automatic hold run most of the way down.
		act(() => {
			vi.advanceTimersByTime(3400);
		});
		act(() => result.current.controls.select(4));
		expect(result.current.index).toBe(4);

		// The remainder of the interrupted hold must not fire.
		act(() => {
			vi.advanceTimersByTime(400);
		});
		expect(result.current.index).toBe(4);

		// A whole fresh hold does.
		act(() => {
			vi.advanceTimersByTime(3600);
		});
		expect(result.current.index).toBe(0);
	});
});
