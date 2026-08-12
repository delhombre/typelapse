import { type RenderFormat, presetFor } from "@/domain/entities/render-config";

/** How each format writes its own name, which is not how the store spells it. */
const FORMAT_NAMES: Record<RenderFormat, string> = {
	mp4: "MP4",
	webm: "WebM",
	gif: "GIF",
};

/**
 * What the one filled shape in the island says.
 *
 * The export button is the only filled control in the whole instrument, so it
 * is also the only place the format and the size can be read without opening
 * anything. It quotes the stored pixel size through the same preset table the
 * chips select from, and quotes nothing at all when that size matches no tier:
 * a clamped export or a hand-edited link would otherwise be labelled with a
 * resolution it is not going to render at.
 */
export function exportCtaLabel(config: {
	format: RenderFormat;
	width: number;
	height: number;
}): string {
	return `Export · ${exportCtaDetail(config)}`;
}

/**
 * The same statement without the verb, for the half of the label a narrow row
 * drops. At 390 the island is the whole width of the phone and the detail is
 * the first thing that has to give; the accessible name keeps the full
 * sentence, so what is dropped is pixels and never meaning.
 */
export function exportCtaDetail(config: {
	format: RenderFormat;
	width: number;
	height: number;
}): string {
	const name = FORMAT_NAMES[config.format];
	const preset = presetFor(config.width, config.height);
	return preset ? `${name} · ${preset.tier}` : name;
}
