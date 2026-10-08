/**
 * Where the split of a before/after comparison sits, as a percentage of the
 * picture from its left edge. Pure, so the slider's two ways in (a pointer and
 * a key) answer to one rule.
 */

/** The split under a pointer at `clientX`, over a picture starting at `left` and `width` wide. */
export function splitAt(clientX: number, left: number, width: number): number {
	if (width <= 0) {
		return 50;
	}
	return Math.round(Math.min(100, Math.max(0, ((clientX - left) / width) * 100)));
}

const STEP = 5;
const PAGE = 25;

/** The split after a key press, or null when the key is not the slider's. */
export function nextSplit(value: number, key: string): number | null {
	const clamp = (v: number) => Math.min(100, Math.max(0, v));
	switch (key) {
		case "ArrowRight":
		case "ArrowUp":
			return clamp(value + STEP);
		case "ArrowLeft":
		case "ArrowDown":
			return clamp(value - STEP);
		case "PageUp":
			return clamp(value + PAGE);
		case "PageDown":
			return clamp(value - PAGE);
		case "Home":
			return 0;
		case "End":
			return 100;
		default:
			return null;
	}
}

/**
 * Where the split rests: in the middle of the line's first word ("export"), so
 * the first look already cuts one word in two, half WebM and half MP4.
 */
export const SPLIT_REST = 22;

/** How far a finger travels before the slider decides whose gesture it is. */
const SLOP = 8;

/**
 * What a drag that began on the picture means after moving (`dx`, `dy`) px.
 * A mouse moves the split at once. A finger or a pen may only be scrolling the
 * page, so the split waits until the drag goes sideways more than down, and
 * lets go for good when it goes down first.
 */
export function dragIntent(
	pointerType: string,
	dx: number,
	dy: number,
): "follow" | "wait" | "release" {
	if (pointerType === "mouse") {
		return "follow";
	}
	if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
		return "follow";
	}
	if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) {
		return "release";
	}
	return "wait";
}

/** The one sweep, from the rest into the word's start, across it, and back. */
const SWEEP = [SPLIT_REST, 6, 40, SPLIT_REST];

/** The split at `t` (0 to 1) of the sweep: each leg eased, timed by its length. */
export function sweepSplit(t: number): number {
	const legs = SWEEP.slice(1).map((to, i) => ({ from: SWEEP[i] ?? SPLIT_REST, to }));
	const total = legs.reduce((sum, leg) => sum + Math.abs(leg.to - leg.from), 0);
	let at = Math.min(1, Math.max(0, t)) * total;
	for (const leg of legs) {
		const length = Math.abs(leg.to - leg.from);
		if (at <= length) {
			const eased = (1 - Math.cos((Math.PI * at) / length)) / 2;
			return leg.from + (leg.to - leg.from) * eased;
		}
		at -= length;
	}
	return SPLIT_REST;
}

/**
 * A split given on the picture (the rest, the sweep), as a split of the frame
 * that shows it: on a phone the frame shows only the start of a wider picture,
 * so the middle of "export" sits further across the frame than on a desktop.
 */
export function onFrame(value: number, pictureWidth: number, frameWidth: number): number {
	if (pictureWidth <= 0 || frameWidth <= 0) {
		return Math.round(value);
	}
	return Math.round(Math.min(100, Math.max(0, (value * pictureWidth) / frameWidth)));
}
