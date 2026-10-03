import {
	MAX_DOTS,
	NARROW_MAX_DOTS,
	formatPlaybackClock,
	playbackFill,
	showsDots,
	stepCounter,
	stepDotLabel,
	transportFace,
	transportLabel,
} from "@/presentation/utils/playback-readout";
import { describe, expect, it } from "vitest";

describe("the transport's face", () => {
	it("shows the spinner while the engine is preparing, whatever play says", () => {
		expect(transportFace(true, false)).toBe("preparing");
		expect(transportFace(true, true)).toBe("preparing");
	});

	it("shows pause while playing and play while stopped", () => {
		expect(transportFace(false, true)).toBe("pause");
		expect(transportFace(false, false)).toBe("play");
	});

	it("names the action the press performs, so the label is the accessible name", () => {
		expect(transportLabel("play")).toBe("Play");
		expect(transportLabel("pause")).toBe("Pause");
		expect(transportLabel("preparing")).toBe("Preparing…");
	});
});

describe("the progress fill", () => {
	it("follows the rAF clock while playing", () => {
		expect(
			playbackFill({ isPlaying: true, playbackProgress: 0.42, currentStepIndex: 0, totalSteps: 5 }),
		).toBeCloseTo(0.42);
	});

	it("reads the position, not a full bar, once paused", () => {
		expect(
			playbackFill({ isPlaying: false, playbackProgress: 1, currentStepIndex: 0, totalSteps: 4 }),
		).toBeCloseTo(0.25);
		expect(
			playbackFill({ isPlaying: false, playbackProgress: 0, currentStepIndex: 3, totalSteps: 4 }),
		).toBeCloseTo(1);
	});

	it("cannot be pushed past its ends by a stale index or a stale clock", () => {
		expect(
			playbackFill({ isPlaying: false, playbackProgress: 0, currentStepIndex: 9, totalSteps: 4 }),
		).toBeCloseTo(1);
		expect(
			playbackFill({ isPlaying: true, playbackProgress: 1.4, currentStepIndex: 0, totalSteps: 4 }),
		).toBe(1);
		expect(
			playbackFill({ isPlaying: true, playbackProgress: -0.2, currentStepIndex: 0, totalSteps: 4 }),
		).toBe(0);
	});

	it("is empty rather than NaN when there are no steps to play", () => {
		expect(
			playbackFill({ isPlaying: false, playbackProgress: 0, currentStepIndex: 0, totalSteps: 0 }),
		).toBe(0);
	});
});

describe("the counter and the dots", () => {
	it("zero-pads both halves so the readout never changes width", () => {
		expect(stepCounter(0, 3)).toBe("01 / 03");
		expect(stepCounter(11, 12)).toBe("12 / 12");
	});

	it("keeps the counter inside the run even if the index has drifted past it", () => {
		expect(stepCounter(7, 3)).toBe("03 / 03");
	});

	it("drops the dot row once the dots would cost more room than they inform", () => {
		expect(showsDots(2)).toBe(true);
		expect(showsDots(MAX_DOTS)).toBe(true);
		expect(showsDots(MAX_DOTS + 1)).toBe(false);
	});

	it("keeps a tighter budget where the row is the width of a phone", () => {
		// At 390 the row also carries the settings, the social preview and the
		// export, so eight dots is 192px it no longer has. Past the narrow budget
		// the counter says the same thing in a tenth of the room.
		expect(showsDots(NARROW_MAX_DOTS, NARROW_MAX_DOTS)).toBe(true);
		expect(showsDots(NARROW_MAX_DOTS + 1, NARROW_MAX_DOTS)).toBe(false);
		expect(NARROW_MAX_DOTS).toBeLessThan(MAX_DOTS);
	});

	it("names each dot with its position, since a 6px dot has no other label", () => {
		expect(stepDotLabel(0, 5)).toBe("Scene 1 of 5");
		expect(stepDotLabel(4, 5)).toBe("Scene 5 of 5");
	});
});

describe("the clock", () => {
	it("reads minutes, seconds and tenths, padded so it never changes width", () => {
		expect(formatPlaybackClock(0)).toBe("00:00.0");
		expect(formatPlaybackClock(2650)).toBe("00:02.6");
		expect(formatPlaybackClock(20_000)).toBe("00:20.0");
		expect(formatPlaybackClock(61_250)).toBe("01:01.2");
	});

	it("never reads below zero", () => {
		expect(formatPlaybackClock(-40)).toBe("00:00.0");
	});
});
