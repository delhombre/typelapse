/**
 * Font and colour strings for a 2D context: pure, and shaped by what CSS does.
 *
 * A canvas takes one `font` shorthand where the DOM takes a stack of separate
 * declarations, and it has no notion of a colour keyword fading to nothing, so
 * both have to be spelled out explicitly here rather than at the call site.
 */

/** Shiki's font-style bitmask: 1 = italic, 2 = bold, 4 = underline. */
const ITALIC = 1;
const BOLD = 2;

/**
 * The `ctx.font` shorthand for a family stack. Family names that contain a
 * space must be quoted, or the shorthand fails to parse and the context
 * silently keeps its previous font: the single most likely way for a canvas to
 * drift from the DOM it is supposed to mirror.
 */
/**
 * @param fontStyle Shiki's bitmask, for code tokens.
 * @param fontWeight An explicit weight, for the chrome bar's own type, which is
 *   styled in CSS rather than by a highlighter and asks for a 600 no bitmask can
 *   express. It wins over the bitmask's bold.
 */
export function canvasFont(
	fontSize: number,
	fontFamily: string,
	fontStyle?: number,
	fontWeight?: number,
): string {
	const families = fontFamily
		.split(",")
		.map((family) => quoteFamily(family.trim()))
		.filter((family) => family !== "")
		.join(", ");
	const italic = fontStyle && fontStyle & ITALIC ? "italic " : "";
	const bold = fontStyle && fontStyle & BOLD ? "700 " : "";
	const weight = fontWeight ? `${fontWeight} ` : bold;
	return `${italic}${weight}${fontSize}px ${families}`;
}

function quoteFamily(family: string): string {
	if (family === "" || family.startsWith('"') || family.startsWith("'")) {
		return family;
	}
	return /\s/.test(family) ? `"${family}"` : family;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#rrggbb` at a given alpha, as an `rgba()` string. A mesh blob fades to
 * *its own* colour at zero alpha rather than to the `transparent` keyword, so
 * that a context interpolating in straight (non-premultiplied) space cannot
 * pull a grey halo through the middle of the fade.
 *
 * Anything that is not a hex colour is returned untouched: the caller wanted a
 * keyword and there is nothing meaningful to interpolate here.
 */
export function colorWithAlpha(color: string, alpha: number): string {
	const match = HEX.exec(color);
	if (!match) {
		return color;
	}
	const digits = match[1] ?? "";
	const full =
		digits.length === 3
			? digits
					.split("")
					.map((d) => d + d)
					.join("")
			: digits;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
