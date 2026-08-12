import { useEffect, useState } from "react";

/** Resume a little before the element enters, so playback is already running by
    the time the visitor can see it: a loop that starts exactly at the edge reads
    as a stutter. */
const DEFAULT_ROOT_MARGIN = "100px";

/**
 * Is this element on screen? Answered by an IntersectionObserver, for animation
 * loops that should not run when nobody can see them.
 *
 * A persistent rAF loop repainting an off-screen layer is invisible work that a
 * Lapse take still measures: the hero instrument alone kept rewriting a 636×366
 * gradient every frame while the visitor read the section below it, and the
 * app-switch animation down there dropped 25 frames for it.
 *
 * Node-based rather than RefObject-based, for the same reason `useResizeObserver`
 * has a node variant: a component whose first render is a placeholder mounts its
 * real element later, and an effect that reads `.current` once would silently
 * never attach. Feed `ref` straight to the element; it is `useState`'s setter, so
 * it is stable and never re-attaches on its own.
 *
 * Defaults to visible: without an observer (SSR, jsdom, an old browser) an
 * animation must play, never stay dead. The observer corrects it on its first
 * delivery.
 */
export function useInViewPlayback<T extends Element = HTMLDivElement>({
	rootMargin = DEFAULT_ROOT_MARGIN,
	threshold = 0,
}: { rootMargin?: string; threshold?: number } = {}): {
	ref: (node: T | null) => void;
	inView: boolean;
} {
	const [node, setNode] = useState<T | null>(null);
	const [inView, setInView] = useState(true);

	useEffect(() => {
		if (!node || typeof IntersectionObserver === "undefined") {
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry) {
					setInView(entry.isIntersecting);
				}
			},
			{ rootMargin, threshold },
		);
		observer.observe(node);

		return () => observer.disconnect();
	}, [node, rootMargin, threshold]);

	return { ref: setNode, inView };
}
