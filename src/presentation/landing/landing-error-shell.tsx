import { type ReactNode, useState } from "react";
import { type LandingTheme, useLandingChrome } from "./use-landing-theme";

/**
 * The theme the landing was in as it failed. `data-landing-theme` is the whole
 * answer while it is there, as it is for the CSS: a `.dark` left on the root by
 * a studio visit does not make a light landing dark. A landing that never
 * mounted left it where index.html set it; a route reached from the studio has
 * none, and the root's `.dark` stands in.
 */
function themeAtFailure(): LandingTheme {
	const root = document.documentElement;
	const marked = root.dataset.landingTheme;
	if (marked === "light" || marked === "dark") {
		return marked;
	}
	return root.classList.contains("dark") ? "dark" : "light";
}

/**
 * What the landing's route puts its error fallback in. The overscroll paint and
 * the status bar colour are the route's, and the page's own effects take them
 * down as a failure unmounts it, so the fallback keeps them: the theme is read
 * as the fallback renders, before those cleanups run, and the effects run after
 * them (React runs every cleanup of a commit before any new effect). They let
 * go when the route is left. The studio's `.dark` is what `.route-state` reads,
 * so the shell carries the theme there too.
 */
export function LandingErrorShell({ children }: { readonly children: ReactNode }) {
	const [theme] = useState(themeAtFailure);
	useLandingChrome(theme);
	return <div className={theme === "dark" ? "dark" : undefined}>{children}</div>;
}
