import type { ScreenPoint } from "./kernel";

/** How much of a figure has to be on screen before its lap plays. */
const MOSTLY_IN_VIEW = 0.6;

type Stops = (ScreenPoint | null)[];
type Tour = (
	stage: HTMLElement,
	stops: Stops,
	onStop?: (index: number) => void,
) => { stop: () => void };

/**
 * Plays a figure's lap once (DECISIONS D8, PO 2026-10-08): the first time the
 * figure is at least 60% in view, the kernel's unseen pointer visits the stops
 * and leaves; then the figure rests and only answers a hand. Never under
 * reduced motion, never again on re-entry, and a real pointer or a focus
 * ends it for good. Returns the cancel.
 */
export function playLapOnce({
	host,
	stops,
	tour,
	reducedMotion,
}: {
	host: HTMLElement;
	stops: Stops;
	tour: Tour;
	reducedMotion: () => boolean;
}): () => void {
	let lap: { stop: () => void } | null = null;
	let done = false;
	const end = () => {
		done = true;
		lap?.stop();
		lap = null;
		observer?.disconnect();
		for (const type of HAND) {
			host.removeEventListener(type, end);
		}
	};
	const HAND = ["pointerdown", "pointermove", "focusin"] as const;

	const start = () => {
		if (done || lap || reducedMotion()) {
			return;
		}
		const leave = stops.lastIndexOf(null);
		lap = tour(host, stops, (index) => {
			if (index === leave) {
				end();
			}
		});
		for (const type of HAND) {
			host.addEventListener(type, end);
		}
	};

	const observer =
		typeof IntersectionObserver === "undefined"
			? null
			: new IntersectionObserver(
					(entries) => {
						if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= MOSTLY_IN_VIEW)) {
							observer?.disconnect();
							start();
						}
					},
					{ threshold: MOSTLY_IN_VIEW },
				);
	if (stops.length && !reducedMotion()) {
		observer?.observe(host);
	}

	return end;
}
