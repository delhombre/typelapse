import type { PlatformCycle } from "@/presentation/landing/iphone-showcase";
import { IphoneShowcase } from "@/presentation/landing/iphone-showcase";
import { act, cleanup, render } from "@testing-library/react";
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* The hand's feedback is the thing under test, so it is a spy rather than the
   real motor: `web-haptics` feature-detects and would no-op in jsdom, which
   would make "no buzz" pass for the wrong reason. */
const { hapticSpy } = vi.hoisted(() => ({ hapticSpy: vi.fn() }));
vi.mock("@/presentation/haptics", () => ({ trigger: hapticSpy }));

const SCREEN_WIDTH = 320;

beforeAll(() => {
	window.matchMedia = ((query: string) => ({
		// Full motion: the ring has to actually follow the finger to have somewhere
		// to spring back from.
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;

	/* jsdom lays nothing out, and a ring one pixel wide would make every nudge a
	   committed swipe by the third-of-the-width rule. */
	Element.prototype.getBoundingClientRect = (): DOMRect =>
		({
			width: SCREEN_WIDTH,
			height: 640,
			top: 0,
			left: 0,
			right: SCREEN_WIDTH,
			bottom: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;

	/* Pointer capture and DOMMatrix are both absent from jsdom. The matrix only
	   has to answer where the ring is: at rest, which is where these drags start. */
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
	Element.prototype.hasPointerCapture = () => false;
	(globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = class {
		e = 0;
	};
});

/* The ring settles on a spring that Motion steps frame by frame, and Motion caps
   what one frame may advance, so a machine under load does not just run the
   spring late: it runs it slow, and no real-time budget for "settled" holds. The
   clock is the test's instead, so the spring takes exactly the frames it needs. */
beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	hapticSpy.mockClear();
});

/** Runs the frames of `ms` of animation time; the spring has no other clock. */
const runFrames = (ms: number) =>
	act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});

const cycleWith = (step: Mock<(direction: 1 | -1) => void>): PlatformCycle => ({
	index: 0,
	platform: "reels",
	direction: 1,
	controls: { step, select: vi.fn() },
});

/** jsdom has no PointerEvent; React only reads the properties, not the class. */
const pointer = (type: string, clientX: number): Event => {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
	Object.assign(event, { pointerId: 1, isPrimary: true, pointerType: "touch" });
	return event;
};

/* Selected on `user-select` and not on the `touch-action: pan-y` that defines
   the gesture, because jsdom's CSS parser silently drops touch-action. */
const surfaceOf = (container: HTMLElement): HTMLElement => {
	const node = container.querySelector<HTMLElement>('[style*="user-select"]');
	if (!node) {
		throw new Error("the swipe surface never mounted");
	}
	return node;
};

const offsetOf = (node: HTMLElement): number => {
	const match = /translateX\((-?[\d.]+)%\)/.exec(node.style.transform);
	return match?.[1] === undefined ? 0 : Number(match[1]);
};

/**
 * One drag, half the screen to the left, fast: far past both the third-of-the
 * width rule and the flick speed, so a release at the end of it certainly
 * commits. The first move only anchors the origin — by design, so an
 * interrupted settle is retargeted rather than snapped — so the travel is the
 * second one, and both tests take the same road up to the last event.
 */
const dragLeft = (surface: HTMLElement): void => {
	act(() => {
		surface.dispatchEvent(pointer("pointerdown", 200));
	});
	act(() => {
		surface.dispatchEvent(pointer("pointermove", 150));
	});
	act(() => {
		surface.dispatchEvent(pointer("pointermove", 40));
	});
};

describe("a swipe the browser takes away", () => {
	it("springs the ring back without moving the cycle or buzzing the hand", async () => {
		const step = vi.fn();
		const { container } = render(<IphoneShowcase cycle={cycleWith(step)} />);
		const surface = surfaceOf(container);

		dragLeft(surface);
		await runFrames(100);
		expect(offsetOf(surface)).toBeLessThan(-10);

		act(() => {
			surface.dispatchEvent(pointer("pointercancel", 40));
		});

		expect(step).not.toHaveBeenCalled();
		expect(hapticSpy).not.toHaveBeenCalled();
		await runFrames(1000);
		expect(offsetOf(surface)).toBe(0);
	});

	it("still commits and buzzes when the same drag is released", async () => {
		const step = vi.fn();
		const { container } = render(<IphoneShowcase cycle={cycleWith(step)} />);
		const surface = surfaceOf(container);

		dragLeft(surface);
		act(() => {
			surface.dispatchEvent(pointer("pointerup", 40));
		});

		expect(step).toHaveBeenCalledWith(1);
		expect(hapticSpy).toHaveBeenCalledWith("light");
		await runFrames(1000);
		expect(offsetOf(surface)).toBe(0);
	});
});
