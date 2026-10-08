import { useEffect, useRef } from "react";
import type { HairlineFigureDef } from "./types";

/**
 * How far below the viewport a figure starts loading. Small on purpose: at
 * 1440 x 900 the first stage starts about 250px under the fold, so the figures
 * load as the reader scrolls toward them, never with the hero.
 */
const NEAR = "200px 0px";

interface HairlineFigureProps {
	/** The figure's module, imported only once its stage is near: `() => import("./scenes")`. */
	load: () => Promise<{ default: HairlineFigureDef }>;
	/** What the drawing shows, for a reader who cannot see it. */
	label: string;
	/** The gesture, in a few words: the line under the figure while it rests. */
	hint: string;
	className?: string;
}

/**
 * One isometric figure drawn on the hairline kernel, with the line under it.
 *
 * Nothing is fetched or drawn until the figure nears the viewport: the kernel
 * and the figure are their own chunk, so the hero never waits on them and a
 * visitor who stops at the hero never pays for them. Once drawn, the figure
 * stays; the kernel's own loop sleeps while it is off screen and lands at rest
 * under reduced motion. The box is reserved by the stylesheet, so the drawing
 * arriving moves nothing.
 *
 * The box is the image a screen reader meets, labelled from the first paint;
 * the line under it is visual only (a live region there would read out every
 * frame of a lap). At rest it says what to do with the figure; while a hand or
 * the lap drives it, what the figure is on.
 */
export function HairlineFigure({ load, label, hint, className = "" }: HairlineFigureProps) {
	const root = useRef<HTMLElement>(null);
	const box = useRef<HTMLDivElement>(null);
	const readOut = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const figure = root.current;
		if (!figure) {
			return;
		}
		let gone = false;
		let teardown: (() => void) | null = null;

		const draw = () => {
			Promise.all([load(), import("./mount-figure")])
				.then(([{ default: def }, { mountFigure }]) => {
					const host = box.current;
					const out = readOut.current;
					if (gone || !host || !out) {
						return;
					}
					teardown = mountFigure(def, host, (text) => {
						const resting = text === "rest";
						out.textContent = resting ? hint : text;
						out.dataset.state = resting ? "rest" : "live";
					});
				})
				.catch((error: unknown) => {
					// The figure stays its label and its hint; the page goes on.
					console.error("A landing figure failed to draw.", error);
				});
		};

		if (typeof IntersectionObserver === "undefined") {
			draw();
		} else {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						observer.disconnect();
						draw();
					}
				},
				{ rootMargin: NEAR },
			);
			observer.observe(figure);
			teardown = () => observer.disconnect();
		}

		return () => {
			gone = true;
			teardown?.();
		};
	}, [load, hint]);

	return (
		<figure ref={root} className={`lp-fig ${className}`}>
			<div ref={box} className="lp-fig-stage" role="img" aria-label={label} />
			<figcaption className="lp-fig-cap" aria-hidden="true">
				<span ref={readOut} className="lp-fig-read" data-state="rest">
					{hint}
				</span>
			</figcaption>
		</figure>
	);
}
