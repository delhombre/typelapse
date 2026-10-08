import { useEffect, useState } from "react";

/**
 * Whether a dark section is currently under the strip at the top of the viewport
 * where the page's fixed furniture floats.
 *
 * The theme toggle is a bare glyph drawn for paper, and the landing alternates
 * paper with full-bleed dark sections, so it disappears into one as it passes. It
 * cannot know that from its own styles: it is `fixed`, and what is behind it is
 * whatever the scroll has put there. (The nav pill no longer asks: it is the
 * island's plate and keeps its fill on every backdrop.)
 *
 * An observer rather than a scroll handler, because the question is "does this
 * rectangle overlap that one" and reading `getBoundingClientRect` on every
 * scroll frame is how a page starts thrashing layout. The root is shrunk to the
 * band itself, so an intersection *is* the answer.
 */
export function useOverDark(bandHeight: number): boolean {
	const [overDark, setOverDark] = useState(false);

	useEffect(() => {
		const sections = document.querySelectorAll(".lp-dark");
		if (sections.length === 0) {
			return;
		}

		let observer: IntersectionObserver | undefined;
		const inBand = new Set<Element>();

		// Rebuilt on resize: the root margin is written against the viewport's
		// height, so it goes stale the moment that changes.
		const connect = () => {
			observer?.disconnect();
			inBand.clear();
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							inBand.add(entry.target);
						} else {
							inBand.delete(entry.target);
						}
					}
					setOverDark(inBand.size > 0);
				},
				{ rootMargin: `0px 0px ${bandHeight - window.innerHeight}px 0px` },
			);
			for (const section of sections) {
				observer.observe(section);
			}
		};

		connect();
		window.addEventListener("resize", connect);
		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", connect);
		};
	}, [bandHeight]);

	return overDark;
}
