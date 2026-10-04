/**
 * What the control island says about playback, as pure functions of the store.
 *
 * The island paints these; nothing here knows it is being painted. Keeping the
 * readout out of the component is what lets a stale index, a clock that
 * overshoots or an empty snippet be answered once, in a test, instead of four
 * times in JSX.
 */

/** Past this many steps the dot row is dropped and the counter carries the position. */
export const MAX_DOTS = 8;

/**
 * The same budget where the row is the width of a phone.
 *
 * At 390 the island carries the settings, the social preview and the export as
 * well as the transport, and eight dots is 192px of position it no longer has
 * to spend. The counter states the same thing in a tenth of the room, so past
 * four the row trades one for the other — the same trade it already makes at
 * every width past eight.
 */
export const NARROW_MAX_DOTS = 4;

export type TransportFace = "preparing" | "pause" | "play";

/** The button's current face: the spinner outranks both, since neither can be pressed yet. */
export function transportFace(isPreparing: boolean, isPlaying: boolean): TransportFace {
	if (isPreparing) {
		return "preparing";
	}
	return isPlaying ? "pause" : "play";
}

/**
 * The action the press performs, which is also the button's accessible name.
 * A transport that renames itself is the pattern screen readers expect here: a
 * constant name with `aria-pressed` would announce "Play, pressed" for a video
 * that is running, which is one negation too many to parse by ear.
 */
export function transportLabel(face: TransportFace): string {
	if (face === "preparing") {
		return "Preparing…";
	}
	return face === "pause" ? "Pause" : "Play";
}

interface FillInput {
	isPlaying: boolean;
	playbackProgress: number;
	currentStepIndex: number;
	totalSteps: number;
}

/**
 * How full the track is, 0 to 1.
 *
 * Playing, it follows the rAF clock, which is what makes it agree with the
 * reels progress baked into the video. Paused, it fills to the end of the
 * current step rather than freezing wherever the clock stopped, so the bar
 * reads as a position instead of looking stuck full on every step but the last.
 */
export function playbackFill({
	isPlaying,
	playbackProgress,
	currentStepIndex,
	totalSteps,
}: FillInput): number {
	if (totalSteps <= 0) {
		return 0;
	}
	if (isPlaying) {
		return clamp01(playbackProgress);
	}
	return clamp01((clampIndex(currentStepIndex, totalSteps) + 1) / totalSteps);
}

/** `01 / 03`: both halves padded, so the readout never changes width mid-run. */
export function stepCounter(currentStepIndex: number, totalSteps: number): string {
	return `${pad(clampIndex(currentStepIndex, totalSteps) + 1)} / ${pad(Math.max(totalSteps, 0))}`;
}

/** Below the cap the dots inform; above it they are a row of identical specks. */
export function showsDots(totalSteps: number, budget: number = MAX_DOTS): boolean {
	return totalSteps >= 2 && totalSteps <= budget;
}

/** A 6px dot carries no text, so its position is its whole accessible name. */
export function stepDotLabel(index: number, totalSteps: number): string {
	return `Scene ${index + 1} of ${totalSteps}`;
}

/**
 * `00:02.6`: the transport clock and the duration beside it. Both use this, so
 * the end of the run reads the same number as the total.
 */
export function formatPlaybackClock(milliseconds: number): string {
	const safe = Math.max(milliseconds, 0);
	const minutes = Math.floor(safe / 60_000);
	const seconds = Math.floor((safe % 60_000) / 1000);
	const tenths = Math.floor((safe % 1000) / 100);
	return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function clampIndex(index: number, totalSteps: number): number {
	return Math.min(Math.max(index, 0), Math.max(totalSteps - 1, 0));
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}
