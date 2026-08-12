/**
 * One icon set for the whole island: 16px box, 1.5 stroke, round caps and
 * joins, single path where possible. The rules that matter here, from
 * design-foundations/icons-and-illustrations:
 *
 * - never mix two libraries on one surface, so these are all drawn here;
 * - stroke thins with the box, so 1.5 at 16px rather than a 24px icon shrunk;
 * - round caps, because square caps read as unfinished in UI;
 * - the play triangle is optically centred (nudged right), since a
 *   mathematically centred triangle looks left-heavy inside a circle.
 */

const base = {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
	"aria-hidden": true,
};

export function PlayGlyph() {
	// Filled, not stroked: below ~12px a 1.5 stroke on a triangle disappears.
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<title>Play</title>
			{/* Nudged 0.5px right of centre: optical, not mathematical. */}
			<path d="M5.9 3.6a.6.6 0 0 1 .92-.5l6 4.4a.6.6 0 0 1 0 1l-6 4.4a.6.6 0 0 1-.92-.5V3.6Z" />
		</svg>
	);
}

export function PauseGlyph() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<title>Pause</title>
			<rect x="4.4" y="3.4" width="2.6" height="9.2" rx="1.05" />
			<rect x="9" y="3.4" width="2.6" height="9.2" rx="1.05" />
		</svg>
	);
}

/** Backdrop: overlapping fields, the shape of a mesh gradient. */
export function BackdropGlyph() {
	return (
		<svg {...base}>
			<title>Backdrop</title>
			<circle cx="6.3" cy="6.3" r="3.4" />
			<circle cx="9.7" cy="9.7" r="3.4" />
		</svg>
	);
}

/** Theme: a window split light and dark, which is what a theme changes. */
export function ThemeGlyph() {
	return (
		<svg {...base}>
			<title>Theme</title>
			<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="2" />
			<path d="M8 3.2v9.6" />
			<path d="M10.6 6.2h1.4M10.6 8h1.4M10.6 9.8h1.4" />
		</svg>
	);
}

/** Aspect: a frame. The label beside it carries the actual value. */
export function AspectGlyph() {
	return (
		<svg {...base}>
			<title>Aspect ratio</title>
			<rect x="2.2" y="4.4" width="11.6" height="7.2" rx="1.6" />
		</svg>
	);
}

export function BackGlyph() {
	return (
		<svg {...base}>
			<title>Back</title>
			<path d="M9.8 4.2 6 8l3.8 3.8" />
		</svg>
	);
}
