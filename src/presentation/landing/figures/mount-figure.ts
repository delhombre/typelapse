import HL from "./kernel";
import type { HairlineFigureDef } from "./types";

/**
 * Draws one figure into `host` and returns its tear-down.
 *
 * The kernel's palette is injected once per document; the landing overrides it
 * with the `--hairline-*` tokens under `.landing-root`, so the figures read the
 * warm ramp of whichever theme the page is in. The drawing is `aria-hidden`:
 * the host carries the image role and the label, and the read-out is written
 * into `out`, the caption beside the stage.
 *
 * The figure is tuned at intensity 0.4, four fifths of the way from its range's
 * low end to its default: the quieter side of what it was drawn for, on a page
 * where it sits beside a picture rather than alone on a bench. The three
 * figures with a stagger share one range, so they spread at one rhythm (32ms).
 */
export function mountFigure(def: HairlineFigureDef, host: HTMLElement, out: Element): () => void {
	HL.inject(document);
	host.setAttribute("data-hairline", def.name);
	const svg = HL.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, host);
	let said = false;
	const read = {
		get textContent() {
			return out.textContent;
		},
		set textContent(value: string | null) {
			said = true;
			out.textContent = value ?? "";
		},
	};
	const [low, middle] = def.range;
	const handle = def.mount({ stage: host, svg, read }, low + 0.8 * (middle - low));
	// A figure that says nothing at mount is at rest.
	if (!said) {
		out.textContent = "rest";
	}
	/* The figure's own lap: an unseen pointer that visits its stops, then leaves
	   it at rest, so a reader with no hand on it still sees what it answers. The
	   kernel runs it only while the stage is on screen, hands over the moment a
	   real pointer or the keyboard arrives, and never under reduced motion. */
	const lap = def.tour?.length ? HL.tour(host, def.tour) : null;

	return () => {
		lap?.stop();
		handle.destroy();
		svg.remove();
		host.removeAttribute("data-hairline");
	};
}
