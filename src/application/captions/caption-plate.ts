import { contrastRatio } from "../accessibility/token-contrast";

/**
 * What a step caption is drawn on, so it can be read on any background.
 *
 * A caption used to wear the watermark's colour: white at 40% over a mesh, which
 * is meant to be a mark you can barely see, and over the default mesh's yellow
 * (`#f1be01`) comes to 1.2:1 against it. A caption is the one line of prose in
 * the video, so it sits on a plate instead of hoping for a background: the
 * island's own dark plate (docs/design/DECISIONS.md D5, `#151517`, which does not
 * follow a theme either) at an alpha where the paper ink on it holds 4.5:1 over
 * the lightest colour any mesh reaches. A plate that dark over a dark mesh is all
 * but invisible, which is what a subtle plate is for.
 *
 * Pure and shared: the preview and the Remotion composition render the same
 * `StepCaption`, and the painter bakes no caption, so these two numbers are the
 * only place the treatment is written.
 */

/** The plate's colour: the island's, which is fixed and ignores the theme. */
export const CAPTION_PLATE_COLOR = "#151517";
/** How much of the background the plate covers; the rest still shows through. */
export const CAPTION_PLATE_ALPHA = 0.64;
/** The caption's ink: the studio's paper, opaque, so the plate alone sets the contrast. */
export const CAPTION_INK = "#faf9f6";

/** How far the plate reaches past the words on each side, in unscaled px. */
export const CAPTION_PLATE_PAD = 8;

/** The plate as a CSS fill: its colour at its alpha. */
export const CAPTION_PLATE_FILL = `rgba(21, 21, 23, ${CAPTION_PLATE_ALPHA})`;

/** `#rrggbb` as three 0..255 channels, or null for anything else. */
function channels(hex: string): [number, number, number] | null {
	const match = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!match?.[1]) {
		return null;
	}
	const value = Number.parseInt(match[1], 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The plate laid over an opaque background, as the colour the caption's ink is read against. */
export function plateOver(background: string): string {
	const ground = channels(background);
	const plate = channels(CAPTION_PLATE_COLOR);
	if (!ground || !plate) {
		return CAPTION_PLATE_COLOR;
	}
	const mixed = ground.map((channel, index) =>
		Math.round(channel * (1 - CAPTION_PLATE_ALPHA) + (plate[index] ?? 0) * CAPTION_PLATE_ALPHA),
	);
	return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG contrast of the caption's ink on its plate, over an opaque background. */
export function captionContrastOver(background: string): number {
	return contrastRatio(CAPTION_INK, plateOver(background));
}
