import { CHROME_COLOR } from "@/presentation/chrome-color";
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type LandingTheme = "light" | "dark";

const STORAGE_KEY = "typelapse.landing-theme";

/**
 * A theme flip remaps every colour token at once, so without help it is a hard
 * cut: the whole page — paper, ink, hairlines, the mesh behind the cards —
 * changes between two frames. The browser can cross-fade it for us if we tell
 * it where the change begins and ends, which is all a view transition is.
 *
 * Two reasons to decline. Not every browser has the API, and someone who has
 * asked for less motion has asked for this too — a full-page dissolve is the
 * most motion the landing ever produces. Both fall back to the flip we have
 * always done, unchanged.
 */
const canCrossFade = (): boolean => {
	return (
		typeof document.startViewTransition === "function" &&
		!window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
};

/**
 * The landing's theme, remembered across visits.
 *
 * Reads the OS preference the first time and the visitor's own choice after
 * that, because someone who has picked a side on this site means it more than
 * their system default does.
 */
const resolveTheme = (): LandingTheme => {
	const stored = window.localStorage.getItem(STORAGE_KEY);

	if (stored === "light" || stored === "dark") {
		return stored;
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

/**
 * What the landing puts on the document outside its own element, for as long
 * as the landing is on screen.
 */
export function useLandingChrome(theme: LandingTheme): void {
	// The page element cannot colour what sits outside it: overscroll rubber-band
	// on macOS, and any viewport the layout does not fill, both fall through to
	// the document's own background, which is white by default. Marking the root
	// element lets CSS paint those too, and `color-scheme` hands the browser the
	// right scrollbars and form controls.
	useEffect(() => {
		document.documentElement.dataset.landingTheme = theme;

		return () => {
			document.documentElement.removeAttribute("data-landing-theme");
		};
	}, [theme]);

	// The status bar and the URL bar take `theme-color`, and index.html can only
	// answer the OS preference, so a visitor who picked dark on a light phone got
	// a cream bar over a near-black page. Every tag takes the chosen paper while
	// the landing is mounted, and gets its own value back when it leaves, so the
	// studio is answered by the OS again.
	useEffect(() => {
		const tags = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
		const original = tags.map((tag) => tag.content);
		for (const tag of tags) {
			tag.content = CHROME_COLOR[theme];
		}

		return () => {
			tags.forEach((tag, i) => {
				tag.content = original[i] ?? tag.content;
			});
		};
	}, [theme]);
}

export function useLandingTheme(): [LandingTheme, () => void] {
	// Resolved during the first render rather than in an effect: starting on
	// light and correcting afterwards flashes a white page at every dark-theme
	// visitor, which is the one moment they are guaranteed to notice.
	const [theme, setTheme] = useState<LandingTheme>(resolveTheme);

	useLandingChrome(theme);

	const toggle = useCallback(() => {
		const flip = () => {
			setTheme((current) => {
				const next = current === "light" ? "dark" : "light";
				window.localStorage.setItem(STORAGE_KEY, next);
				return next;
			});
		};

		if (!canCrossFade()) {
			flip();
			return;
		}

		// The snapshot is taken when the callback returns, so the flip has to have
		// landed in the DOM by then: a state update React is still free to batch
		// would be captured as the *old* frame twice, and nothing would fade.
		document.startViewTransition(() => {
			flushSync(flip);
		});
	}, []);

	return [theme, toggle];
}
