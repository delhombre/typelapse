import { playLapOnce } from "./figure-lap";
import HL from "./kernel";
import type { HairlineFigureDef } from "./types";

/**
 * Draws one figure into `host` and returns its tear-down.
 *
 * The kernel's palette is injected once per document; the landing overrides it
 * with the `--hairline-*` tokens under `.landing-root`, so the figures read the
 * warm ramp of whichever theme the page is in. The drawing is `aria-hidden`:
 * the host carries the image role and the label, and every read-out the figure
 * gives goes to `say` ("rest" when nothing is under the pointer).
 *
 * The figure is tuned at intensity 0.4, four fifths of the way from its range's
 * low end to its default: the quieter side of what it was drawn for, on a page
 * where it sits beside a picture rather than alone on a bench. The three
 * figures with a stagger share one range, so they spread at one rhythm (32ms).
 */
export function mountFigure(
	def: HairlineFigureDef,
	host: HTMLElement,
	say: (text: string) => void,
): () => void {
	HL.inject(document);
	host.setAttribute("data-hairline", def.name);
	const svg = HL.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, host);
	let last: string | null = null;
	const read = {
		get textContent() {
			return last;
		},
		set textContent(value: string | null) {
			last = value ?? "";
			say(last);
		},
	};
	const [low, middle] = def.range;
	const handle = def.mount({ stage: host, svg, read }, low + 0.8 * (middle - low));
	// A figure that says nothing at mount is at rest.
	if (last === null) {
		read.textContent = "rest";
	}
	/* The figure's own lap, once: an unseen pointer visits its stops the first
	   time the figure is mostly in view, then leaves it at rest, so a reader
	   with no hand on it still sees what it answers (DECISIONS D8). */
	const cancelLap = playLapOnce({
		host,
		stops: def.tour ?? [],
		tour: HL.tour,
		reducedMotion: () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
	});

	return () => {
		cancelLap();
		handle.destroy();
		svg.remove();
		host.removeAttribute("data-hairline");
	};
}
