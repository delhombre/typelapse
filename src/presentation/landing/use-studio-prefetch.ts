import { prefetchStudio } from "@/presentation/utils/studio-prefetch";
import { useEffect } from "react";

/** Any link into the studio, however it is styled: the nav, the island, the hero, the close. */
const STUDIO_LINK = 'a[href="/app"], a[href^="/app#"], a[href^="/app?"]';

/** The hero's paste field, which navigates to /app on submit: the surest sign of a visit to come. */
export const STUDIO_INTENT_FIELD = "data-studio-intent";
const SELECTOR = `${STUDIO_LINK}, [${STUDIO_INTENT_FIELD}]`;

/**
 * Fetch the studio's files the moment someone reaches for a way into it: a
 * pointer over the link, a keyboard focus on it, a finger on it. By the time the
 * click lands the chunk is usually already in the cache, and a visitor who only
 * reads the page never pays for a studio they did not open.
 *
 * One listener each on the document, not one per link: the landing has a dozen
 * ways in and a link added tomorrow is covered without remembering this.
 */
export function useStudioPrefetch(): void {
	useEffect(() => {
		const reach = (event: Event) => {
			if (event.target instanceof Element && event.target.closest(SELECTOR)) {
				prefetchStudio();
			}
		};
		const events = ["pointerover", "focusin", "touchstart"] as const;
		for (const name of events) {
			document.addEventListener(name, reach, { passive: true });
		}
		return () => {
			for (const name of events) {
				document.removeEventListener(name, reach);
			}
		};
	}, []);
}
