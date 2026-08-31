/**
 * The studio's interface feedback vocabulary.
 *
 * These cues are deliberately semantic. The caller says that a value snapped
 * or a task succeeded; the browser adapter decides how that intent sounds and
 * the haptics adapter decides how it feels. Nothing here reaches the DOM, Web
 * Audio or a device motor, so the palette stays deterministic and testable.
 */

export type FeedbackIntent = "selection" | "toggle" | "commit" | "snap" | "success" | "error";

export type FeedbackOscillator = "sine" | "triangle";

export type FeedbackHaptic = "selection" | "light" | "medium" | "rigid" | "success" | "error";

export interface FeedbackVoice {
	oscillator: FeedbackOscillator;
	frequency: number;
	/** A small pitch movement keeps a cue tactile rather than alarm-like. */
	endFrequency?: number;
	startMs: number;
	durationMs: number;
	gain: number;
}

export interface FeedbackCue {
	haptic: FeedbackHaptic;
	voices: readonly FeedbackVoice[];
}

/**
 * Typelapse's own restrained palette. Frequencies are intentionally not copied
 * from a reference product: the intervals express our code-and-timeline model.
 */
export const FEEDBACK_CUES: Readonly<Record<FeedbackIntent, FeedbackCue>> = {
	selection: {
		haptic: "selection",
		voices: [
			{
				oscillator: "sine",
				frequency: 620,
				endFrequency: 690,
				startMs: 0,
				durationMs: 34,
				gain: 0.028,
			},
		],
	},
	toggle: {
		haptic: "light",
		voices: [
			{
				oscillator: "triangle",
				frequency: 410,
				endFrequency: 520,
				startMs: 0,
				durationMs: 52,
				gain: 0.026,
			},
		],
	},
	commit: {
		haptic: "medium",
		voices: [
			{
				oscillator: "sine",
				frequency: 290,
				endFrequency: 380,
				startMs: 0,
				durationMs: 82,
				gain: 0.04,
			},
			{
				oscillator: "sine",
				frequency: 580,
				endFrequency: 620,
				startMs: 20,
				durationMs: 64,
				gain: 0.02,
			},
		],
	},
	snap: {
		haptic: "rigid",
		voices: [
			{
				oscillator: "triangle",
				frequency: 980,
				endFrequency: 760,
				startMs: 0,
				durationMs: 22,
				gain: 0.022,
			},
		],
	},
	success: {
		haptic: "success",
		voices: [
			{
				oscillator: "sine",
				frequency: 523.25,
				endFrequency: 554.37,
				startMs: 0,
				durationMs: 92,
				gain: 0.036,
			},
			{
				oscillator: "sine",
				frequency: 783.99,
				endFrequency: 830.61,
				startMs: 46,
				durationMs: 112,
				gain: 0.032,
			},
		],
	},
	error: {
		haptic: "error",
		voices: [
			{
				oscillator: "triangle",
				frequency: 250,
				endFrequency: 190,
				startMs: 0,
				durationMs: 100,
				gain: 0.042,
			},
			{
				oscillator: "sine",
				frequency: 180,
				endFrequency: 150,
				startMs: 64,
				durationMs: 116,
				gain: 0.028,
			},
		],
	},
};

export function feedbackCue(intent: FeedbackIntent): FeedbackCue {
	return FEEDBACK_CUES[intent];
}

/** Dense pointer streams share one tiny gate so sound and haptics stay together. */
export function shouldPulse(
	previousAt: number | null,
	now: number,
	minimumIntervalMs: number,
): boolean {
	return previousAt === null || now - previousAt >= minimumIntervalMs;
}
