/**
 * Pick a legible overlay color (watermark, caption) for a given background.
 * Shared by the browser preview and the Remotion composition so text baked over
 * the video reads the same as it does in the preview.
 *
 * - transparent: a soft tint of the theme foreground
 * - mesh gradient: white (mesh presets are always richly colored / dark enough)
 * - image: white (photos skew busy/dark; a bright overlay stays legible)
 * - solid hex: black on light backgrounds, white on dark ones (by luminance)
 * - anything else: a soft tint of the theme foreground
 */
export function getWatermarkColor(background: string, themeForeground: string): string {
	if (background === "transparent") {
		return `${themeForeground}66`;
	}
	if (background.startsWith("mesh:")) {
		return "rgba(255,255,255,0.4)";
	}
	if (background.startsWith("image:")) {
		return "rgba(255,255,255,0.45)";
	}
	const hexMatch = background.match(/#([0-9a-fA-F]{6})/);
	if (!hexMatch?.[1]) {
		return `${themeForeground}66`;
	}
	const hex = hexMatch[1];
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
}
