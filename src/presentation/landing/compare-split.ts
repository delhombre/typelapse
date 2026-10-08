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
