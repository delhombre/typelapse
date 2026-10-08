import { type RefObject, useEffect } from "react";

/** A pixel of slack at each end: a zoomed or fractional layout never lands on 0 exactly. */
const SLACK = 1;

/**
 * Which edges of a horizontally scrolling row still hide content, so only
 * those fade (design audit 2026-10-08 D10: the fade stays on the edge that
 * still has content).
 */
export function scrollFades({
	scrollLeft,
	clientWidth,
	scrollWidth,
}: {
	scrollLeft: number;
	clientWidth: number;
	scrollWidth: number;
}): { start: boolean; end: boolean } {
	return {
		start: scrollLeft > SLACK,
		end: scrollLeft + clientWidth < scrollWidth - SLACK,
	};
}

/** Keeps `data-fade-start` and `data-fade-end` on a row in step with its scroll and its size. */
export function useScrollFades(row: RefObject<HTMLElement | null>): void {
	useEffect(() => {
		const el = row.current;
		if (!el) {
			return;
		}
		const update = () => {
			const { start, end } = scrollFades(el);
			el.toggleAttribute("data-fade-start", start);
			el.toggleAttribute("data-fade-end", end);
		};
		update();
		el.addEventListener("scroll", update, { passive: true });
		const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
		resize?.observe(el);
		return () => {
			el.removeEventListener("scroll", update);
			resize?.disconnect();
		};
	}, [row]);
}
