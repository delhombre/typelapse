import { useCallback, useEffect, useState } from "react";

export type LandingTheme = "light" | "dark";

const STORAGE_KEY = "typelapse.landing-theme";

/**
 * The landing's theme, remembered across visits.
 *
 * Reads the OS preference the first time and the visitor's own choice after
 * that, because someone who has picked a side on this site means it more than
 * their system default does.
 */
export function useLandingTheme(): [LandingTheme, () => void] {
	const [theme, setTheme] = useState<LandingTheme>("light");

	useEffect(() => {
		const stored = window.localStorage.getItem(STORAGE_KEY);

		if (stored === "light" || stored === "dark") {
			setTheme(stored);
			return;
		}

		const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		setTheme(prefersDark ? "dark" : "light");
	}, []);

	const toggle = useCallback(() => {
		setTheme((current) => {
			const next = current === "light" ? "dark" : "light";
			window.localStorage.setItem(STORAGE_KEY, next);
			return next;
		});
	}, []);

	return [theme, toggle];
}
