/**
 * The app's background model, read rather than guessed.
 *
 * A background is stored as one string, and the DOM is happy to take any of its
 * five shapes straight: a mesh id, `transparent`, a hex, a CSS gradient, or an
 * inline image. A canvas is not. `fillStyle` accepts a *colour* and silently
 * keeps its previous value for anything else — so a gradient preset or an
 * uploaded photo used to export as whatever was left in the context, which on an
 * opaque canvas is black.
 *
 * This module is the missing half of `resolveBackgroundCss`: where that one
 * turns the model into CSS for the two DOM renderers, this turns it into
 * structure the painter can draw. One string, one parse, three surfaces.
 */

import { colorWithAlpha } from "../frame-painter/font";
import { type MeshPreset, parseImageBackground, parseMeshBackground } from "./mesh-gradient";

/** A colour at a position along the gradient line, 0..1. */
export interface ColorStop {
	offset: number;
	color: string;
}

export type GradientShape = "circle" | "ellipse";

export type Backdrop =
	| { kind: "transparent" }
	| { kind: "solid"; color: string }
	| { kind: "mesh"; preset: MeshPreset }
	/** `angleDeg` is CSS's: 0 points up, and it turns clockwise. */
	| { kind: "linear"; angleDeg: number; stops: ColorStop[] }
	/** `x`/`y` are the centre in % of the surface; the size is farthest-corner. */
	| { kind: "radial"; shape: GradientShape; x: number; y: number; stops: ColorStop[] }
	| { kind: "image"; source: string };

/**
 * Read a background string into something paintable.
 *
 * Total by construction: anything unrecognised comes back as a solid of the
 * string itself, which is exactly what the painter did with every background
 * before this existed. So an unknown value is never worse than it was, and every
 * value the picker can actually produce is now better.
 */
export function parseBackdrop(background: string): Backdrop {
	const value = background.trim();
	if (value === "" || value === "transparent" || value === "none") {
		return { kind: "transparent" };
	}
	const preset = parseMeshBackground(value);
	if (preset) {
		return { kind: "mesh", preset };
	}
	const source = parseImageBackground(value);
	if (source) {
		return { kind: "image", source };
	}
	return parseGradient(value) ?? { kind: "solid", color: value };
}

const GRADIENT = /^(linear|radial)-gradient\(([\s\S]*)\)$/i;

function parseGradient(value: string): Backdrop | null {
	const match = GRADIENT.exec(value);
	if (!match) {
		return null;
	}
	const args = splitTopLevel(match[2] ?? "");
	if (args.length < 2) {
		return null;
	}
	return match[1]?.toLowerCase() === "linear" ? parseLinear(args) : parseRadial(args);
}

function parseLinear(args: string[]): Backdrop | null {
	const angleDeg = parseAngle(args[0] ?? "");
	const stops = parseStops(angleDeg === null ? args : args.slice(1));
	if (stops.length < 2) {
		return null;
	}
	// CSS's own default when the gradient names no direction.
	return { kind: "linear", angleDeg: angleDeg ?? 180, stops };
}

function parseRadial(args: string[]): Backdrop | null {
	const head = (args[0] ?? "").trim();
	const isPosition = /^(circle|ellipse)\b/i.test(head) || /\bat\b/i.test(head);
	const shape: GradientShape = isPosition && /\bcircle\b/i.test(head) ? "circle" : "ellipse";
	const centre = isPosition ? parseCentre(head) : { x: 50, y: 50 };
	const stops = parseStops(isPosition ? args.slice(1) : args);
	if (stops.length < 2) {
		return null;
	}
	return { kind: "radial", shape, x: centre.x, y: centre.y, stops };
}

function parseCentre(head: string): { x: number; y: number } {
	const at = /\bat\s+([\s\S]+)$/i.exec(head);
	if (!at) {
		return { x: 50, y: 50 };
	}
	const parts = (at[1] ?? "").trim().split(/\s+/);
	// One value positions the named axis and centres the other, which is what a
	// missing second part falls back to.
	return { x: parsePosition(parts[0]), y: parsePosition(parts[1]) };
}

const KEYWORD_POSITION: Record<string, number> = {
	center: 50,
	left: 0,
	right: 100,
	top: 0,
	bottom: 100,
};

function parsePosition(token: string | undefined): number {
	if (token === undefined) {
		return 50;
	}
	const percent = /^(-?[\d.]+)%$/.exec(token.trim());
	if (percent) {
		return Number(percent[1]);
	}
	return KEYWORD_POSITION[token.trim().toLowerCase()] ?? 50;
}

const SIDE_ANGLE: Record<string, number> = {
	top: 0,
	right: 90,
	bottom: 180,
	left: 270,
};

/** A CSS `<angle>` or `to <side>` in degrees, or null when the token is a stop. */
function parseAngle(token: string): number | null {
	const text = token.trim().toLowerCase();
	const angle = /^(-?[\d.]+)(deg|turn|rad|grad)$/.exec(text);
	if (angle) {
		const value = Number(angle[1]);
		if (angle[2] === "turn") {
			return value * 360;
		}
		if (angle[2] === "rad") {
			return (value * 180) / Math.PI;
		}
		if (angle[2] === "grad") {
			return value * 0.9;
		}
		return value;
	}
	const side = /^to\s+(top|right|bottom|left)$/.exec(text);
	if (side) {
		return SIDE_ANGLE[side[1] ?? ""] ?? null;
	}
	return null;
}

/**
 * The colour stops, with every missing position filled in.
 *
 * CSS's rule: the first stop defaults to 0%, the last to 100%, and a run of
 * unpositioned stops in between is spaced evenly across the gap it sits in.
 */
function parseStops(args: string[]): ColorStop[] {
	const parsed = args
		.map((arg) => parseStop(arg))
		.filter((stop): stop is { color: string; offset: number | null } => stop !== null);
	if (parsed.length < 2) {
		return [];
	}

	const offsets = parsed.map((stop) => stop.offset);
	offsets[0] ??= 0;
	offsets[offsets.length - 1] ??= 1;
	for (let i = 1; i < offsets.length - 1; i++) {
		if (offsets[i] !== null && offsets[i] !== undefined) {
			continue;
		}
		const previous = lastKnown(offsets, i);
		const next = nextKnown(offsets, i);
		offsets[i] =
			previous.offset +
			((next.offset - previous.offset) * (i - previous.at)) / (next.at - previous.at);
	}

	// A stop may not sit before the one in front of it; CSS pulls it forward.
	let highest = 0;
	const stops = parsed.map((stop, index) => {
		highest = Math.max(highest, offsets[index] ?? 0);
		return { offset: clamp01(highest), color: stop.color };
	});
	return premultiplyTransparent(stops);
}

function lastKnown(
	offsets: (number | null | undefined)[],
	from: number,
): { at: number; offset: number } {
	for (let i = from - 1; i >= 0; i--) {
		const offset = offsets[i];
		if (offset !== null && offset !== undefined) {
			return { at: i, offset };
		}
	}
	return { at: 0, offset: 0 };
}

function nextKnown(
	offsets: (number | null | undefined)[],
	from: number,
): { at: number; offset: number } {
	for (let i = from + 1; i < offsets.length; i++) {
		const offset = offsets[i];
		if (offset !== null && offset !== undefined) {
			return { at: i, offset };
		}
	}
	return { at: offsets.length - 1, offset: 1 };
}

function parseStop(arg: string): { color: string; offset: number | null } | null {
	const text = arg.trim();
	if (text === "") {
		return null;
	}
	const positioned = /^([\s\S]*?)\s+(-?[\d.]+)%$/.exec(text);
	if (positioned) {
		return { color: (positioned[1] ?? "").trim(), offset: Number(positioned[2]) / 100 };
	}
	return { color: text, offset: null };
}

/**
 * `transparent` as the neighbouring colour at zero alpha.
 *
 * CSS interpolates gradients in premultiplied space, so `#6d28d9 → transparent`
 * fades the purple out without ever passing through anything else. A canvas
 * interpolates straight, and the keyword is transparent *black*, so the same
 * gradient pulls a grey halo through its middle. Naming the neighbour's own
 * colour at alpha 0 is how the mesh path has always dodged this; every gradient
 * gets it now.
 */
function premultiplyTransparent(stops: ColorStop[]): ColorStop[] {
	return stops.map((stop, index) => {
		if (stop.color.trim().toLowerCase() !== "transparent") {
			return stop;
		}
		const neighbour = stops[index - 1] ?? stops[index + 1];
		const opaque = neighbour && neighbour.color.trim().toLowerCase() !== "transparent";
		return { offset: stop.offset, color: opaque ? colorWithAlpha(neighbour.color, 0) : stop.color };
	});
}

/** Split on commas that are not inside parentheses, so `rgba(…)` stays whole. */
function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === "(") {
			depth++;
		} else if (char === ")") {
			depth--;
		} else if (char === "," && depth === 0) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/**
 * The two ends of a CSS gradient line on a `width × height` box.
 *
 * CSS sizes the line so the two corners perpendicular to it project exactly onto
 * its ends: length is `|w·sin θ| + |h·cos θ|`, centred on the box. A canvas takes
 * the two points instead of an angle, so the angle is spelled out here.
 */
export function linearGradientLine(
	angleDeg: number,
	width: number,
	height: number,
): { x0: number; y0: number; x1: number; y1: number } {
	const radians = (angleDeg * Math.PI) / 180;
	// CSS 0deg points up; a canvas's y grows downwards, hence the negated cosine.
	const dx = Math.sin(radians);
	const dy = -Math.cos(radians);
	const length = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
	const cx = width / 2;
	const cy = height / 2;
	return {
		x0: cx - (dx * length) / 2,
		y0: cy - (dy * length) / 2,
		x1: cx + (dx * length) / 2,
		y1: cy + (dy * length) / 2,
	};
}

/**
 * The radii of a farthest-corner gradient centred at (cx, cy).
 *
 * A circle simply reaches the corner. An ellipse keeps the ratio of the two
 * farthest *sides* and is scaled until it passes through the farthest corner,
 * which is the `√2` — that is CSS's definition, not an approximation of it.
 */
export function radialGradientRadii(
	shape: GradientShape,
	cx: number,
	cy: number,
	width: number,
	height: number,
): { rx: number; ry: number } {
	const fx = Math.max(cx, width - cx);
	const fy = Math.max(cy, height - cy);
	if (shape === "circle") {
		const radius = Math.sqrt(fx * fx + fy * fy);
		return { rx: radius, ry: radius };
	}
	return { rx: fx * Math.SQRT2, ry: fy * Math.SQRT2 };
}

/** Where an image lands under `center center / cover`: fills the box, centred. */
export function coverRect(
	imageWidth: number,
	imageHeight: number,
	boxWidth: number,
	boxHeight: number,
): { x: number; y: number; width: number; height: number } {
	if (imageWidth <= 0 || imageHeight <= 0) {
		return { x: 0, y: 0, width: boxWidth, height: boxHeight };
	}
	const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
	const width = imageWidth * scale;
	const height = imageHeight * scale;
	return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
