import { LiveMorph } from "@/presentation/landing/magic-move-section";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduce: false }));

vi.mock("motion/react", async (importOriginal) => ({
	...(await importOriginal<typeof import("motion/react")>()),
	useReducedMotion: () => motion.reduce,
}));

vi.mock("@/presentation/components/preview/looping-frames", () => ({
	LoopingFrames: () => <div aria-label="Morph" />,
}));

// jsdom has no layout, and the fit only needs the observer to exist.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(() => {
	motion.reduce = false;
});

describe("landing morph stage: the live morph", () => {
	it("offers to play the morph", () => {
		render(<LiveMorph />);
		expect(screen.getByRole("button", { name: "Play motion" })).toBeTruthy();
	});

	it("does not offer a motion that reduced motion will not play", () => {
		// The frame rests on its last state under reduced motion and ignores
		// `playing`, so the button only flipped its own label to "Replay".
		motion.reduce = true;
		render(<LiveMorph />);
		expect(screen.queryByRole("button", { name: /play motion|replay/i })).toBeNull();
	});
});
