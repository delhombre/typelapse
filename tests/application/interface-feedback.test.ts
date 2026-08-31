import {
	FEEDBACK_CUES,
	type FeedbackIntent,
	feedbackCue,
	shouldPulse,
} from "@/application/audio/interface-feedback";
import { describe, expect, it } from "vitest";

describe("interface feedback palette", () => {
	it("names the few semantic moments the studio is allowed to sound", () => {
		const intents: FeedbackIntent[] = ["selection", "toggle", "commit", "snap", "success", "error"];

		expect(Object.keys(FEEDBACK_CUES).sort()).toEqual([...intents].sort());
	});

	it("keeps every voice short, quiet and inside a useful audible range", () => {
		for (const cue of Object.values(FEEDBACK_CUES)) {
			for (const voice of cue.voices) {
				expect(voice.frequency).toBeGreaterThanOrEqual(90);
				expect(voice.frequency).toBeLessThanOrEqual(1800);
				expect(voice.gain).toBeGreaterThan(0);
				expect(voice.gain).toBeLessThanOrEqual(0.12);
				expect(voice.durationMs).toBeGreaterThan(0);
				expect(voice.durationMs).toBeLessThanOrEqual(180);
			}
		}
	});

	it("uses a tactile tick for scrubbing and a two-note resolve for success", () => {
		expect(feedbackCue("snap").haptic).toBe("rigid");
		expect(feedbackCue("snap").voices[0]?.durationMs).toBeLessThanOrEqual(30);
		expect(feedbackCue("success").voices).toHaveLength(2);
		expect(feedbackCue("success").voices[1]?.frequency).toBeGreaterThan(
			feedbackCue("success").voices[0]?.frequency ?? 0,
		);
	});

	it("throttles dense scrub pulses without suppressing deliberate taps", () => {
		expect(shouldPulse(null, 100, 58)).toBe(true);
		expect(shouldPulse(100, 140, 58)).toBe(false);
		expect(shouldPulse(100, 158, 58)).toBe(true);
	});
});
