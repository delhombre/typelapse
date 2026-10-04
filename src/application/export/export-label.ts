import { type RenderFormat, presetFor } from "@/domain/entities/render-config";

/** How each format writes its own name, which is not how the store spells it. */
const FORMAT_NAMES: Record<RenderFormat, string> = {
	mp4: "MP4",
	webm: "WebM",
	gif: "GIF",
};

/** A format as it writes its own name: "MP4", "WebM", "GIF". */
export function formatName(format: RenderFormat): string {
	return FORMAT_NAMES[format];
}

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

/**
 * What the finished file's codec is called, where that is not a foregone
 * conclusion.
 *
 * MP4 is H.264, and will be H.264 for as long as MP4's job is to open anywhere
 * on anything: saying so adds a word and no information. WebM's codec is chosen
 * off a ladder at run time — AV1 with whole chroma where the browser has it, and
 * VP9 or VP8 where it does not — and the difference between the top rung and the
 * bottom one is most of the file's quality. A ladder that falls back without
 * saying so is indistinguishable, from the outside, from one that never worked.
 */
export function exportCodecNote(format: RenderFormat, codecLabel: string | null): string | null {
	if (format !== "webm" || !codecLabel) {
		return null;
	}
	return `${FORMAT_NAMES[format]} · ${codecLabel}`;
}
