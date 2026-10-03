import type { LandingTheme } from "./use-landing-theme";
import { useOverDark } from "./use-over-dark";

interface ThemeToggleProps {
	theme: LandingTheme;
	onToggle: () => void;
}

/**
 * A quiet corner switch. It sits outside the nav pill on purpose: the nav is a
 * solid dark island in both themes, and a control that flips the page's whole
 * palette should not be hidden inside the one element that never changes.
 *
 * Being fixed, it passes over the page's dark sections, where an ink glyph is
 * an invisible one — so it inverts with what is under it. `mix-blend-mode:
 * difference` would do this on its own and with no observer at all, which is
 * the appeal; but it inverts against *every* backdrop, and the one this passes
 * over most is the primary's own mesh, where difference turns a white glyph
 * blue. Ink reads 12:1 on that mesh already. Two states, not a filter.
 *
 * It only floats where the page leaves it a gutter. The content column is
 * 1024px wide, so below 1024 + 2 x 56px its corner is body text, and a fixed
 * glyph rode over a heading or a code line at every scroll offset on a phone.
 * A scrim or a filled disc would still cover that text, and the nav island is
 * absent for the whole hero, so there it belongs to the top of the page and
 * scrolls away with it: a theme is picked once a visit, and the OS preference
 * has already picked it for most visitors.
 */
/** The strip it floats in: 20 of top offset and 36 of button. */
const TOGGLE_BAND = 56;

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
	const next = theme === "light" ? "dark" : "light";
	const onDark = useOverDark(TOGGLE_BAND);

	return (
		<button
			type="button"
			onClick={onToggle}
			aria-label={`Switch to ${next} theme`}
			className={`hit-ext absolute top-5 right-[max(1.25rem,env(safe-area-inset-right))] z-50 min-[1136px]:fixed flex size-9 items-center justify-center rounded-full transition-colors duration-300 ease-[var(--ease-out)] ${
				onDark
					? "text-paper/75 hover:bg-paper/10 hover:text-paper"
					: "text-ink/70 hover:bg-ink/6 hover:text-ink"
			}`}
		>
			<Icon theme={theme} />
		</button>
	);
}

function Icon({ theme }: { theme: LandingTheme }) {
	if (theme === "light") {
		return (
			<svg
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				aria-hidden="true"
			>
				<title>Moon</title>
				<path d="M13.5 9.4A5.8 5.8 0 0 1 6.6 2.5a5.8 5.8 0 1 0 6.9 6.9Z" />
			</svg>
		);
	}

	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<title>Sun</title>
			<circle cx="8" cy="8" r="3.1" />
			<path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1" />
		</svg>
	);
}
