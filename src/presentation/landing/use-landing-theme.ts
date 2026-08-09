import { useCallback, useState } from "react";

export type LandingTheme = "light" | "dark";

const STORAGE_KEY = "typelapse.landing-theme";

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

export function useLandingTheme(): [LandingTheme, () => void] {
	// Resolved during the first render rather than in an effect: starting on
	// light and correcting afterwards flashes a white page at every dark-theme
	// visitor, which is the one moment they are guaranteed to notice.
	const [theme, setTheme] = useState<LandingTheme>(resolveTheme);

	const toggle = useCallback(() => {
		setTheme((current) => {
			const next = current === "light" ? "dark" : "light";
			window.localStorage.setItem(STORAGE_KEY, next);
			return next;
		});
	}, []);

	return [theme, toggle];
}
