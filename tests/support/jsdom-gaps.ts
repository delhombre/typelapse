/**
 * Scoped stand-ins for the two browser calls jsdom does not implement and the
 * code under test makes on purpose.
 *
 * jsdom answers them with a "Not implemented" line on the virtual console and
 * returns nothing, once per call. The gate (`.craft/verify.sh`) fails on that
 * line, so a test that reaches one of them names it here, for its own file,
 * rather than every test getting a stub that hides the next stray caller.
 */

import { type MockInstance, afterAll, beforeEach, vi } from "vitest";

/**
 * Takes the spy before each test and gives the method back after the file's last
 * one. Not after each test: a Motion frame or a font-load callback that lands
 * between two tests, or after the last, must find the stand-in still in place.
 */
function holdForFile(taken: () => MockInstance): void {
	let spy: MockInstance | undefined;
	beforeEach(() => {
		spy = taken();
	});
	afterAll(() => {
		spy?.mockRestore();
	});
}

/** Advance of JetBrains Mono and the monospaces it falls back to, in em. */
const MONOSPACE_ADVANCE_EM = 0.6;

/**
 * Gives `<canvas>.getContext("2d")` a context that measures text the way a real
 * monospace face does: `advanceEm` per character at the size in `font`. The
 * composition measures its theme font's advance on one (`measureAdvance`), and
 * a card sized on any other number is not the card a browser draws.
 */
export function useMonospaceCanvas(advanceEm = MONOSPACE_ADVANCE_EM): void {
	holdForFile(() => {
		const meter = {
			font: "",
			measureText(text: string) {
				const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(meter.font)?.[1] ?? "0");
				return { width: advanceEm * size * text.length };
			},
		};
		return vi
			.spyOn(HTMLCanvasElement.prototype, "getContext")
			.mockReturnValue(meter as unknown as CanvasRenderingContext2D);
	});
}

/**
 * Makes `window.scrollTo` a no-op. Motion's keyframe resolver calls it to
 * restore the scroll position after measuring; jsdom has no scrolling to restore.
 */
export function useInertWindowScroll(): void {
	holdForFile(() => vi.spyOn(window, "scrollTo").mockImplementation(() => undefined));
}
