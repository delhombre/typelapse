/**
 * Caption timing — pure, framework-free, shared by the preview and the video.
 *
 * A step's caption is fully visible while its step is held. Across a morph the
 * captions cross-dissolve with a gap: the outgoing caption fades out over the
 * first 40% of the transition, nothing shows through the middle 20%, then the
 * incoming caption fades in over the last 40%. A step with no caption simply
 * contributes nothing (opacity 0 for its whole span).
 */

/** Where playback sits, as far as captions care: a held step or a morph. */
export interface CaptionPlayback {
	phase: "hold" | "transition";
	/** Held step, or the "from" step of the active transition. */
	index: number;
	/** Local progress within a transition (0..1); ignored while holding. */
	t: number;
}

/** Fraction of the transition each caption gets to fade (leaving 20% empty). */
const FADE_FRACTION = 0.4;

function clamp01(value: number): number {
	if (value < 0) {
		return 0;
	}
	if (value > 1) {
		return 1;
	}
	return value;
}

/** The caption text and opacity to paint at a given playback position. */
export function captionAt(
	playback: CaptionPlayback,
	annotations: readonly string[],
): { text: string; opacity: number } {
	const { phase, index, t } = playback;

	if (phase === "hold") {
		const text = annotations[index] ?? "";
		return { text, opacity: text ? 1 : 0 };
	}

	const from = annotations[index] ?? "";
	const to = annotations[index + 1] ?? "";
	const progress = clamp01(t);

	// First 40%: the outgoing caption fades out.
	if (progress < FADE_FRACTION) {
		return { text: from, opacity: from ? 1 - progress / FADE_FRACTION : 0 };
	}
	// Last 40%: the incoming caption fades in.
	if (progress >= 1 - FADE_FRACTION) {
		return { text: to, opacity: to ? (progress - (1 - FADE_FRACTION)) / FADE_FRACTION : 0 };
	}
	// Middle 20%: intentional empty beat between the two captions.
	return { text: "", opacity: 0 };
}
