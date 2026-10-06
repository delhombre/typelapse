import { stillFrameOf } from "@/application/export/png-snapshot";
import { type VideoScript, videoScript } from "@/application/export/video-script";
import { DEFAULT_TRANSITION_EASING } from "@/application/magic-move/easing";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import { describe, expect, it } from "vitest";

const plan = {
	frames: [
		{ tokens: [], lineCount: 1 },
		{ tokens: [], lineCount: 1 },
		{ tokens: [], lineCount: 1 },
	],
	transitions: [],
} as unknown as MagicMovePlan;

function scriptOf(durations: number[]): VideoScript {
	return videoScript({
		plan,
		durations,
		transitionMs: 500,
		transitionEasing: DEFAULT_TRANSITION_EASING,
		fps: 10,
		loop: false,
		typewriter: false,
		firstCode: "",
		focusSets: durations.map(() => undefined),
	});
}

describe("stillFrameOf", () => {
	it("is the last frame of the scene's hold, where the scene has finished settling", () => {
		// Holds of 1 s, 2 s, 1 s at 10 fps with 5-frame morphs between:
		// [0,10) morph [15,35) morph [40,50).
		const script = scriptOf([1000, 2000, 1000]);
		expect(stillFrameOf(script, 0)).toBe(9);
		expect(stillFrameOf(script, 1)).toBe(34);
		expect(stillFrameOf(script, 2)).toBe(49);
	});

	it("lands inside the hold, never in the morph that follows it", () => {
		const script = scriptOf([1000, 2000, 1000]);
		for (const index of [0, 1, 2]) {
			const frame = stillFrameOf(script, index);
			const hold = script.segments.find((s) => s.type === "hold" && s.index === index);
			expect(frame).toBeGreaterThanOrEqual(hold?.startFrame ?? Number.POSITIVE_INFINITY);
			expect(frame).toBeLessThan(hold?.endFrame ?? 0);
		}
	});

	it("falls back to the first frame for a scene the script does not have", () => {
		expect(stillFrameOf(scriptOf([1000]), 7)).toBe(0);
	});

	it("stays on the scene's own frame when its hold is zero frames long", () => {
		// A zero-length hold has no frame of its own; the morph out of it starts on
		// its picture, so that is where it is.
		const script = scriptOf([0, 1000]);
		expect(stillFrameOf(script, 0)).toBe(0);
	});
});
