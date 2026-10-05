import { DESKTOP_SCENE_MIN_WIDTH } from "@/application/layout/scene-stage";
import { dotBudget } from "@/presentation/utils/playback-readout";
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

/** The scene switches when its three surfaces fit, not at a device-named breakpoint. */
export function useIsDesktop(): boolean {
	return useMediaQuery(`(min-width: ${DESKTOP_SCENE_MIN_WIDTH}px)`);
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

/** A finger, not a cursor: the primary pointer is imprecise, so targets must be 44px. */
export function useIsCoarse(): boolean {
	return useMediaQuery("(pointer: coarse)");
}

function subscribeToResize(onChange: () => void) {
	window.addEventListener("resize", onChange);
	return () => window.removeEventListener("resize", onChange);
}

/**
 * How many step dots the island can hold right now. Under a finger the count is a
 * question about the screen's width (every dot is a 44px cell), which no media
 * query can ask of a count, so the width is read here and the answer comes from
 * `dotBudget`.
 */
export function useDotBudget(): number {
	const narrow = useIsNarrow();
	const coarse = useIsCoarse();
	const width = useSyncExternalStore(
		subscribeToResize,
		() => window.innerWidth,
		() => 0,
	);
	return dotBudget({ narrow, coarse, width });
}
