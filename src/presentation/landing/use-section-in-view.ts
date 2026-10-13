import { useEffect, useState } from "react";

/**
 * A thin band across the middle of the viewport: a section is "in view" while it
 * crosses it, so one section at a time, and none while the hero or a gap between
 * sections is there.
 */
const WATCHED_BAND = "-45% 0px -54% 0px";

/** The id, among `ids`, of the section crossing the watched band; null when none is. */
export function useSectionInView(ids: readonly string[]): string | null {
	const [current, setCurrent] = useState<string | null>(null);
	// Joined, so a caller's new array of the same ids does not tear the observer down.
	const key = ids.join(" ");

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") {
			return;
		}
		const crossing = new Set<string>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						crossing.add(entry.target.id);
					} else {
						crossing.delete(entry.target.id);
					}
				}
				setCurrent(key.split(" ").find((id) => crossing.has(id)) ?? null);
			},
			{ rootMargin: WATCHED_BAND },
		);
		for (const id of key.split(" ")) {
			const section = document.getElementById(id);
			if (section) {
				observer.observe(section);
			}
		}
		return () => observer.disconnect();
	}, [key]);

	return current;
}
