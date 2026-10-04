import {
	type FeedbackIntent,
	feedbackCue,
	shouldPulse,
} from "@/application/audio/interface-feedback";
import { BrowserInterfaceFeedback } from "@/infrastructure/audio/browser-interface-feedback";
import { useInterfaceFeedbackStore } from "@/presentation/stores/interface-feedback.store";
import { WebHaptics } from "web-haptics";

/* The honest platform reality: `navigator.vibrate` covers Android. Apple
   patched the hidden-switch trick in iOS 26.5, so current iPhones get a
   silent no-op, and desktops never had a motor to begin with. The call
   sites cost nothing where unsupported. */
const haptics = new WebHaptics();
const audio = new BrowserInterfaceFeedback();
let lastPulseAt: number | null = null;

/** Sound and touch share one semantic event so they cannot drift a frame apart. */
export function feedback(intent: FeedbackIntent): void {
	const cue = feedbackCue(intent);
	if (useInterfaceFeedbackStore.getState().enabled) {
		audio.play(cue);
	}
	void haptics.trigger(cue.haptic);
}

/** Pointer streams may report hundreds of values; one tactile tick every 58ms is enough. */
export function feedbackPulse(intent: FeedbackIntent, minimumIntervalMs = 58): void {
	const now = performance.now();
	if (!shouldPulse(lastPulseAt, now, minimumIntervalMs)) {
		return;
	}
	lastPulseAt = now;
	feedback(intent);
}

/**
 * A tap of feedback for something the visitor's own hand just did. Never
 * wired to a timer: a page that buzzes the phone on its own clock is the
 * canonical anti-pattern.
 *
 * Shared by the landing and the studio. It lived under `landing/` while the
 * landing was its only caller; the studio's control island wants the same
 * tap on the same kind of press, and a marketing page is not a library the
 * product may import from.
 */
export function trigger(preset: "light" | "selection"): void {
	feedback(preset === "selection" ? "selection" : "toggle");
}
