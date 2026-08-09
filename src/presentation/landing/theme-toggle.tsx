import type { LandingTheme } from "./use-landing-theme";

interface ThemeToggleProps {
	theme: LandingTheme;
	onToggle: () => void;
}

/**
 * A quiet corner switch. It sits outside the nav pill on purpose: the nav is a
 * solid dark island in both themes, and a control that flips the page's whole
 * palette should not be hidden inside the one element that never changes.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
	const next = theme === "light" ? "dark" : "light";

	return (
		<button
			type="button"
			onClick={onToggle}
			aria-label={`Switch to ${next} theme`}
			className="fixed top-5 right-5 z-50 flex size-9 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-ink/6 hover:text-ink"
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
