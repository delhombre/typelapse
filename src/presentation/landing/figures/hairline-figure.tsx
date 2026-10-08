import { useEffect, useRef } from "react";
import type { HairlineFigureDef } from "./types";

/** How far ahead of the viewport a figure starts loading: about a screen's worth of scroll. */
const NEAR = "600px 0px";

interface HairlineFigureProps {
	/** The figure's module, imported only once its stage is near: `() => import("./scenes")`. */
	load: () => Promise<{ default: HairlineFigureDef }>;
	/** What the drawing shows, for a reader who cannot see it. */
	label: string;
	/** The gesture, in a few words, under the stage. */
	hint: string;
	className?: string;
}

/**
 * One isometric figure drawn on the hairline kernel, with its caption.
 *
 * Nothing is fetched or drawn until the figure nears the viewport: the kernel
 * and the figure are their own chunk, so the hero never waits on them and a
 * visitor who stops at the hero never pays for them. Once drawn, the figure
 * stays; the kernel's own loop sleeps while it is off screen and lands at rest
 * under reduced motion. The stage's 5:4 box is reserved by the stylesheet, so
 * the drawing arriving moves nothing.
 *
 * The stage is the image a screen reader meets, labelled from the first paint;
 * the read-out beside the gesture says what the pointer is on, `rest` when
 * nothing is.
 */
export function HairlineFigure({ load, label, hint, className = "" }: HairlineFigureProps) {
	const root = useRef<HTMLElement>(null);
	const stage = useRef<HTMLDivElement>(null);
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
					const host = stage.current;
					const out = readOut.current;
					if (gone || !host || !out) {
						return;
					}
					teardown = mountFigure(def, host, out);
				})
				.catch(() => undefined);
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
	}, [load]);

	return (
		<figure ref={root} className={`lp-fig ${className}`}>
			<div ref={stage} className="lp-fig-stage" role="img" aria-label={label} />
			<figcaption className="lp-fig-cap">
				<span className="lp-fig-hint">{hint}</span>
				<span ref={readOut} className="lp-fig-read">
					rest
				</span>
			</figcaption>
		</figure>
	);
}
