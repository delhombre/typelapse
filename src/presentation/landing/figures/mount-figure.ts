import { playLapOnce } from "./figure-lap";
import HL from "./kernel";
import type { HairlineFigureDef } from "./types";

/**
 * Intensity on the skill's 0 to 1 slider, where 0.5 is a figure's default: the
 * quieter side of what it was drawn for, on a page where it sits beside a
 * picture rather than alone on a bench. The three figures with a stagger share
 * one range, so they spread at one rhythm (32ms).
 */
const QUIET = 0.4;

/**
 * One ink box for all five figures (review of #248, P1.3). Each figure's own
 * `fit` centres its most extreme pose in the 400 x 320 drawing, which left
 * their resting drawings at different sizes and off centre. Here the drawing is
 * placed by its rest: the rest ink is scaled to at most 340 wide and 232 tall,
 * centred across, and stood on a line 6 units above the bottom of a 400 x 250
 * box, so every figure rests on one baseline with its caption a fixed step
 * under it. Units are the drawing's own (the box is 400 wide).
 */
const BOX = { width: 400, height: 250 };
const INK = { width: 340, height: 232, foot: 6 };

/** Where the drawing goes inside the box: a scale and a translation, in drawing units. */
export function placeInk(ink: { x: number; y: number; width: number; height: number }): {
	scale: number;
	x: number;
	y: number;
} {
	const scale = Math.min(INK.width / ink.width, INK.height / ink.height);
	return {
		scale,
		x: BOX.width / 2 - scale * (ink.x + ink.width / 2),
		y: BOX.height - INK.foot - scale * (ink.y + ink.height),
	};
}

/**
 * Draws one figure into `box` and returns its tear-down.
 *
 * The figure gets a host of its own inside the box, which the kernel sizes at
 * 5:4 and reads the pointer on; the host is moved and scaled with a transform
 * (see `placeInk`), and since the kernel maps the pointer through the host's
 * on-screen rectangle, the hit tests follow the drawing. The kernel's palette
 * is injected once per document; the landing overrides it with the
 * `--hairline-*` tokens under `.landing-root`. The drawing is `aria-hidden`:
 * the box carries the image role and the label, and every read-out the figure
 * gives goes to `say` ("rest" when nothing is under the pointer).
 *
 * A figure that throws while mounting leaves nothing behind and the error is
 * rethrown for the caller to report.
 */
export function mountFigure(
	def: HairlineFigureDef,
	box: HTMLElement,
	say: (text: string) => void,
): () => void {
	HL.inject(document);
	const host = document.createElement("div");
	host.setAttribute("data-hairline", def.name);
	box.append(host);
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
	let handle: ReturnType<HairlineFigureDef["mount"]>;
	try {
		handle = def.mount({ stage: host, svg, read }, low + (QUIET / 0.5) * (middle - low));
	} catch (error) {
		host.remove();
		throw error;
	}
	// A figure that says nothing at mount is at rest.
	if (last === null) {
		read.textContent = "rest";
	}

	const ink = typeof svg.getBBox === "function" ? svg.getBBox() : null;
	if (ink && ink.width > 0 && ink.height > 0) {
		const place = placeInk(ink);
		host.style.transform = `translate(${(place.x / 400) * 100}%, ${(place.y / 320) * 100}%) scale(${place.scale})`;
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
		host.remove();
	};
}
