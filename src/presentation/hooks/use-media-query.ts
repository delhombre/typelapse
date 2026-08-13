import { useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query and re-render on change.
 * Uses useSyncExternalStore so it stays correct across concurrent renders.
 */
export function useMediaQuery(query: string): boolean {
	function subscribe(onChange: () => void) {
		const mql = window.matchMedia(query);
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}

	function getSnapshot() {
		return window.matchMedia(query).matches;
	}

	// Assume mobile-first before hydration (no window on the server).
	function getServerSnapshot() {
		return false;
	}

	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind's `lg` breakpoint: the switch between the mobile sheet and the desktop split. */
export function useIsDesktop(): boolean {
	return useMediaQuery("(min-width: 1024px)");
}

/**
 * Tailwind's `sm` floor: the width at which the island stops being able to
 * afford words beside its glyphs. The stylesheet already answers this query in
 * several places; the island also has to answer it in JavaScript, because how
 * many step dots fit is a question about a count, and CSS cannot count.
 */
export function useIsNarrow(): boolean {
	return useMediaQuery("(max-width: 639px)");
}
