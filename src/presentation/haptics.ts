import { WebHaptics } from "web-haptics";

/* The honest platform reality: `navigator.vibrate` covers Android. Apple
   patched the hidden-switch trick in iOS 26.5, so current iPhones get a
   silent no-op, and desktops never had a motor to begin with. The call
   sites cost nothing where unsupported. */
const haptics = new WebHaptics();

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
	void haptics.trigger(preset);
}
