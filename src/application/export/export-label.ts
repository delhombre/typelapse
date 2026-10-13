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
 * What the finished file's codec is called, for every format a codec touched.
 *
 * WebM's codec is chosen off a ladder at run time — AV1 with whole chroma where
 * the browser has it, and VP9 or VP8 where it does not — and the difference
 * between the top rung and the bottom one is most of the file's quality. A
 * ladder that falls back without saying so is indistinguishable, from the
 * outside, from one that never worked.
 *
 * MP4 says it too, though its ladder only ever picks a profile of H.264: the
 * product says the export names the codec it used, and a note that is there for
 * WebM and missing for the default format makes that sentence false where most
 * people read it (#170). A GIF has no rung, so the worker reports none.
 */
export function exportCodecNote(format: RenderFormat, codecLabel: string | null): string | null {
	if (format === "gif" || !codecLabel) {
		return null;
	}
	return `${FORMAT_NAMES[format]} · ${codecLabel}`;
}

/**
 * The names of the Where options, the one table the control (both of its
 * surfaces), the captions caveat, the link and the line under the frame read.
 * The desktop rail has no room for "This device", so it takes the compact form.
 */
export const WHERE_LABEL = {
	device: "This device",
	deviceCompact: "Device",
	server: "Server",
	cloud: "Cloud",
} as const;

/**
 * What the line under the frame tags a caption nothing on this device draws:
 * the target that does bake it, as Where lists it in this build. Server where the
 * local API is offered, Cloud where a hosted build lists it (accounts on), and,
 * on a hosted build with no accounts, where Where lists only This device, no
 * target bakes it.
 */
export function bakingTargetTag(input: { serverOffered: boolean; cloudListed: boolean }): string {
	if (input.serverOffered) {
		return `${WHERE_LABEL.server} only`;
	}
	if (input.cloudListed) {
		return `${WHERE_LABEL.cloud} only`;
	}
	return "Not in this export";
}

/**
 * What the on-device export says about captions, video and still alike: the
 * painter keeps the caption band but bakes no caption into it, so a project
 * with one gets a file that does not carry it. Only the server render does.
 */
export function captionsNote(hasCaptions: boolean): string | null {
	return hasCaptions ? "captions are not baked on this device yet" : null;
}

/**
 * The same limit as a sentence to read before Render, not after it: a file that
 * lacks the captions was already rendered by the time the old note said so.
 * `null` when there is nothing to warn about; the server offer, when there is
 * one, is the way out.
 */
export function captionsCaveat(input: {
	hasCaptions: boolean;
	onDevice: boolean;
	serverOffered: boolean;
}): string | null {
	if (!input.onDevice || !input.hasCaptions) {
		return null;
	}
	return input.serverOffered
		? `Captions are not baked on this device yet. Choose ${WHERE_LABEL.server} to keep them.`
		: "Captions are not baked on this device yet.";
}

/**
 * What a GIF does to the frame rate, said while the rate is still chosen. The
 * format cannot hold 60 fps (and its size budget stops well short of the
 * format's own ceiling), so a chip that says 60 has to say what it becomes.
 * `safeFps` is the rate the encoder will really use.
 */
export function gifFpsCaveat(input: {
	format: RenderFormat;
	fps: number;
	safeFps: number;
}): string | null {
	if (input.format !== "gif" || input.safeFps >= input.fps) {
		return null;
	}
	return `A GIF plays at up to ${input.safeFps} fps, so ${input.fps} renders at ${input.safeFps}.`;
}

/** A file size the way the status row writes it: whole KB under a megabyte, then MB to one place. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) {
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The sentence a saved export is announced with. The note arrives as a sentence
 * of its own, full stop included (`deviceNote`, `stillNote`), so the join adds
 * a stop only where there is none: it used to add a second one, and a GIF's
 * note read "GIF: 960×540..".
 */
export function savedSentence(done: SavedExport): string {
	return `Saved ${done.filename}${savedTail(done)}`;
}

/**
 * Everything after the filename in {@link savedSentence}: the status row sets
 * the name in bold between "Saved" and this, so what it shows and what a screen
 * reader is told are one sentence built once.
 */
export function savedTail(done: SavedExport): string {
	const where = done.target === "device" ? "on this device" : "on the server";
	const note = done.note ? ` ${done.note.replace(/\.+$/, "")}.` : "";
	return `, ${formatBytes(done.bytes)}, in ${(done.elapsedMs / 1000).toFixed(1)}s ${where}.${note}`;
}

interface SavedExport {
	filename: string;
	bytes: number;
	elapsedMs: number;
	target: string;
	note?: string;
}
