/**
 * Animated mesh-gradient backgrounds: pure and time-driven.
 *
 * Produces a CSS `background` string for a given preset and time `t` (seconds).
 * Colored blobs drift along looping sine paths, giving the flowing "liquid"
 * backdrop that premium code-video tools use. The exact same function drives the
 * browser preview (via rAF) and the exported video (via Remotion's frame count),
 * so the motion reads identically in both.
 */

interface Blob {
	color: string;
	/** Base position, in %. */
	x: number;
	y: number;
	/** Drift amplitude, in %. */
	ax: number;
	ay: number;
	/** Whole cycles per loop period (keeps the loop seamless). */
	cx: number;
	cy: number;
	/** Phase offset, in turns (0..1). */
	phase: number;
	/** Blob radius, in %. */
	radius: number;
}

export interface MeshPreset {
	id: string;
	label: string;
	base: string;
	/** Representative color for watermark contrast / swatches. */
	accent: string;
	blobs: Blob[];
}

/** Loop period in seconds: the animation repeats seamlessly every LOOP_PERIOD. */
export const MESH_LOOP_PERIOD = 16;

const TAU = Math.PI * 2;

export const MESH_PRESETS: MeshPreset[] = [
	{
		id: "aurora",
		label: "Aurora",
		base: "#0a0a18",
		accent: "#6d5cf0",
		blobs: [
			{ color: "#6d28d9", x: 25, y: 25, ax: 12, ay: 10, cx: 1, cy: 1, phase: 0, radius: 55 },
			{ color: "#2563eb", x: 75, y: 30, ax: 14, ay: 12, cx: 1, cy: 2, phase: 0.3, radius: 55 },
			{ color: "#06b6d4", x: 55, y: 75, ax: 16, ay: 10, cx: 2, cy: 1, phase: 0.6, radius: 50 },
			{ color: "#8b5cf6", x: 15, y: 80, ax: 10, ay: 12, cx: 1, cy: 1, phase: 0.85, radius: 45 },
		],
	},
	{
		id: "nebula",
		label: "Nebula",
		base: "#0d0a12",
		accent: "#e0509a",
		blobs: [
			{ color: "#db2777", x: 30, y: 30, ax: 14, ay: 10, cx: 1, cy: 1, phase: 0.1, radius: 55 },
			{ color: "#7c3aed", x: 72, y: 25, ax: 12, ay: 14, cx: 2, cy: 1, phase: 0.4, radius: 55 },
			{ color: "#f97316", x: 65, y: 78, ax: 15, ay: 11, cx: 1, cy: 2, phase: 0.7, radius: 48 },
			{ color: "#4338ca", x: 18, y: 72, ax: 11, ay: 13, cx: 1, cy: 1, phase: 0.9, radius: 46 },
		],
	},
	{
		id: "ocean",
		label: "Ocean",
		base: "#04121a",
		accent: "#22d3ee",
		blobs: [
			{ color: "#0ea5e9", x: 28, y: 28, ax: 13, ay: 11, cx: 1, cy: 1, phase: 0, radius: 55 },
			{ color: "#14b8a6", x: 74, y: 34, ax: 15, ay: 10, cx: 2, cy: 1, phase: 0.35, radius: 52 },
			{ color: "#2563eb", x: 58, y: 76, ax: 12, ay: 13, cx: 1, cy: 2, phase: 0.65, radius: 50 },
			{ color: "#22d3ee", x: 16, y: 74, ax: 10, ay: 11, cx: 1, cy: 1, phase: 0.85, radius: 42 },
		],
	},
	{
		id: "ember",
		label: "Ember",
		base: "#140a08",
		accent: "#fb923c",
		blobs: [
			{ color: "#ea580c", x: 30, y: 30, ax: 13, ay: 10, cx: 1, cy: 1, phase: 0.05, radius: 55 },
			{ color: "#e11d48", x: 72, y: 28, ax: 12, ay: 13, cx: 1, cy: 2, phase: 0.4, radius: 52 },
			{ color: "#f59e0b", x: 62, y: 76, ax: 15, ay: 11, cx: 2, cy: 1, phase: 0.7, radius: 48 },
			{ color: "#9333ea", x: 18, y: 74, ax: 10, ay: 12, cx: 1, cy: 1, phase: 0.9, radius: 44 },
		],
	},
	{
		id: "forest",
		label: "Forest",
		base: "#04140c",
		accent: "#34d399",
		blobs: [
			{ color: "#059669", x: 28, y: 30, ax: 12, ay: 11, cx: 1, cy: 1, phase: 0.1, radius: 55 },
			{ color: "#10b981", x: 74, y: 30, ax: 14, ay: 10, cx: 2, cy: 1, phase: 0.4, radius: 50 },
			{ color: "#0d9488", x: 58, y: 76, ax: 13, ay: 12, cx: 1, cy: 2, phase: 0.65, radius: 50 },
			{ color: "#65a30d", x: 18, y: 72, ax: 10, ay: 11, cx: 1, cy: 1, phase: 0.88, radius: 44 },
		],
	},
];

const PRESET_BY_ID = new Map(MESH_PRESETS.map((preset) => [preset.id, preset]));

/** `mesh:aurora` → the aurora preset; anything else → undefined. */
export function parseMeshBackground(background: string): MeshPreset | undefined {
	if (!background.startsWith("mesh:")) {
		return undefined;
	}
	return PRESET_BY_ID.get(background.slice("mesh:".length));
}

export function isMeshBackground(background: string): boolean {
	return parseMeshBackground(background) !== undefined;
}

const SOLID_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A plain `#rgb` / `#rrggbb` solid color (drives the color-picker selected state). */
export function isSolidBackground(background: string): boolean {
	return SOLID_HEX.test(background);
}

/**
 * `image:<dataURL>` → the inline data-image URL; anything else → null.
 *
 * Only `data:image/...` payloads are honored. A remote or other-scheme payload
 * (`image:http://...`, `image:javascript:...`, `image:data:text/html,...`) is
 * rejected here: it would otherwise flow into a CSS `url(...)` and make the
 * renderer (headless Chrome, server-side) fetch it, an SSRF vector.
 */
export function parseImageBackground(background: string): string | null {
	if (!background.startsWith("image:")) {
		return null;
	}
	const payload = background.slice("image:".length);
	return payload.startsWith("data:image/") ? payload : null;
}

export function isImageBackground(background: string): boolean {
	return parseImageBackground(background) !== null;
}

/**
 * True when a background string is safe to paint server-side: it can never make
 * the renderer fetch a remote resource. The render route validates the untrusted
 * payload with this at the trust boundary, falling back to a default mesh when it
 * fails. Default-deny: only these known-safe forms pass.
 *  - `mesh:<id>` and `transparent`: no resource reference at all.
 *  - a solid hex color.
 *  - a CSS gradient that contains no `url(` (so it cannot reference a URL).
 *  - `image:data:image/...`: an inline data URL only (see parseImageBackground).
 * Anything else, notably a raw `url(...)` or an `image:` with a non-data scheme,
 * is rejected.
 */
export function isSafeBackground(background: string): boolean {
	if (background === "transparent") {
		return true;
	}
	if (background.startsWith("mesh:")) {
		return true;
	}
	if (isSolidBackground(background)) {
		return true;
	}
	if (background.startsWith("image:")) {
		return parseImageBackground(background) !== null;
	}
	if (/gradient\(/i.test(background)) {
		return !/url\(/i.test(background);
	}
	return false;
}

/** CSS `background` string for a preset at time `t` seconds (loops every MESH_LOOP_PERIOD). */
export function meshGradientCss(preset: MeshPreset, t: number): string {
	const phase = (t / MESH_LOOP_PERIOD) % 1;
	const layers = preset.blobs.map((blob) => {
		const x = blob.x + blob.ax * Math.sin(TAU * (blob.cx * phase + blob.phase));
		const y = blob.y + blob.ay * Math.cos(TAU * (blob.cy * phase + blob.phase));
		return `radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${blob.color} 0%, transparent ${blob.radius}%)`;
	});
	return `${layers.join(", ")}, ${preset.base}`;
}

/** Resolve a background string to a CSS value at time `t` (static strings pass through). */
export function resolveBackgroundCss(background: string, t: number): string {
	const preset = parseMeshBackground(background);
	if (preset) {
		return meshGradientCss(preset, t);
	}
	const image = parseImageBackground(background);
	if (image) {
		return `url("${image}") center center / cover no-repeat`;
	}
	return background;
}
