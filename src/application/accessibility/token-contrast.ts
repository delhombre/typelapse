interface Rgb {
	r: number;
	g: number;
	b: number;
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

function parseHex(color: string): Rgb | null {
	const match = HEX_COLOR.exec(color);
	if (!match) {
		return null;
	}
	const compact = match[1];
	if (!compact) {
		return null;
	}
	const expanded =
		compact.length === 3
			? compact
					.split("")
					.map((character) => `${character}${character}`)
					.join("")
			: compact;
	return {
		r: Number.parseInt(expanded.slice(0, 2), 16),
		g: Number.parseInt(expanded.slice(2, 4), 16),
		b: Number.parseInt(expanded.slice(4, 6), 16),
	};
}

function linearChannel(channel: number): number {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
	return (
		0.2126 * linearChannel(color.r) +
		0.7152 * linearChannel(color.g) +
		0.0722 * linearChannel(color.b)
	);
}

function rgbContrast(first: Rgb, second: Rgb): number {
	const light = Math.max(luminance(first), luminance(second));
	const dark = Math.min(luminance(first), luminance(second));
	return (light + 0.05) / (dark + 0.05);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
	return {
		r: Math.round(from.r + (to.r - from.r) * amount),
		g: Math.round(from.g + (to.g - from.g) * amount),
		b: Math.round(from.b + (to.b - from.b) * amount),
	};
}

function toHex(color: Rgb): string {
	return `#${[color.r, color.g, color.b]
		.map((channel) => channel.toString(16).padStart(2, "0"))
		.join("")}`;
}

/** WCAG contrast ratio for two opaque hex colours. Unsupported colours return 1. */
export function contrastRatio(foreground: string, background: string): number {
	const fg = parseHex(foreground);
	const bg = parseHex(background);
	return fg && bg ? rgbContrast(fg, bg) : 1;
}

/**
 * Preserve the syntax palette whenever it is readable; otherwise make the
 * smallest sRGB move toward the higher-contrast pole. This runs before the
 * shared magic-move plan is laid out, so DOM preview, Remotion and canvas
 * export all receive the same corrected token colour.
 */
export function ensureReadableTokenColor(
	foreground: string,
	background: string,
	minimumRatio = 4.5,
): string {
	const fg = parseHex(foreground);
	const bg = parseHex(background);
	if (!fg || !bg || rgbContrast(fg, bg) >= minimumRatio) {
		return foreground;
	}

	const target = rgbContrast(WHITE, bg) >= rgbContrast(BLACK, bg) ? WHITE : BLACK;
	let low = 0;
	let high = 1;
	for (let iteration = 0; iteration < 20; iteration++) {
		const midpoint = (low + high) / 2;
		if (rgbContrast(mix(fg, target, midpoint), bg) >= minimumRatio) {
			high = midpoint;
		} else {
			low = midpoint;
		}
	}
	return toHex(mix(fg, target, high));
}
