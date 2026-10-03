const VALID_FORMATS = ["mp4", "gif", "webm"] as const;
export type RenderFormat = (typeof VALID_FORMATS)[number];

/** Aspect-ratio presets: wide, square, reels, portrait, tall. */
export const ASPECT_LABELS = ["16:9", "1:1", "9:16", "4:5", "3:4"] as const;
export type AspectLabel = (typeof ASPECT_LABELS)[number];

/** Width:height for each preset, kept exact so the math never drifts. */
const ASPECT_RATIOS: Record<AspectLabel, readonly [number, number]> = {
	"16:9": [16, 9],
	"1:1": [1, 1],
	"9:16": [9, 16],
	"4:5": [4, 5],
	"3:4": [3, 4],
};

/** Resolution tiers, coarsest to finest. */
export const RESOLUTION_TIERS = ["1080p", "1440p", "4K"] as const;
export type ResolutionTier = (typeof RESOLUTION_TIERS)[number];

/**
 * A tier names the SHORT edge, which is how every platform quotes a resolution:
 * "1080p" vertical is 1080 wide by 1920 tall, not 1080 tall. Anchoring on the
 * short edge is also what keeps a tier meaningful across shapes — the pixel
 * density of the code is identical at 1080p whether you export wide or vertical,
 * so switching aspect never silently changes how sharp the type looks.
 *
 * 4K anchors at 2160 because 4K UHD is 3840x2160: the tier is its short edge too.
 */
const TIER_SHORT_EDGE: Record<ResolutionTier, number> = {
	"1080p": 1080,
	"1440p": 1440,
	"4K": 2160,
};

/** Round up to the nearest even pixel: encoders reject odd dimensions. */
function toEven(value: number): number {
	return 2 * Math.round(value / 2);
}

/**
 * Pixel dimensions for an aspect/tier combination. The short edge is the tier;
 * the long edge follows the ratio. Every combination of the shipped presets
 * lands on even numbers exactly (see the matrix in the tests), but the rounding
 * is applied anyway so a future ratio can't produce an unencodable frame.
 */
export function dimensionsFor(
	aspect: AspectLabel,
	tier: ResolutionTier,
): { width: number; height: number } {
	const [w, h] = ASPECT_RATIOS[aspect];
	const shortEdge = TIER_SHORT_EDGE[tier];
	if (w <= h) {
		return { width: toEven(shortEdge), height: toEven((shortEdge * h) / w) };
	}
	return { width: toEven((shortEdge * w) / h), height: toEven(shortEdge) };
}

/**
 * Reverse lookup: which preset produced these dimensions, if any. Returns null
 * for off-matrix sizes (a plan-clamped export, or a hand-edited share link) so
 * the UI can show "no chip selected" instead of claiming the wrong one.
 */
export function presetFor(
	width: number,
	height: number,
): { aspect: AspectLabel; tier: ResolutionTier } | null {
	for (const aspect of ASPECT_LABELS) {
		for (const tier of RESOLUTION_TIERS) {
			const dims = dimensionsFor(aspect, tier);
			if (dims.width === width && dims.height === height) {
				return { aspect, tier };
			}
		}
	}
	return null;
}

/**
 * The largest and smallest pixel dimension a render may use, on either axis.
 *
 * ONE ceiling, shared by the studio and the render route, because they cannot
 * afford to disagree. The route clamps width and height independently, so a size
 * the studio accepted but the renderer will not is worse than a rejection: only
 * the offending axis moves, and the export comes back in a shape the user never
 * chose (4000x2250 previews as 16:9 and renders as 3840x2250). Whatever the
 * studio lets through, the renderer has to honour untouched.
 *
 * It is DERIVED from the preset matrix rather than written down, so the ceiling
 * cannot drift away from the tiers it exists to admit: it is the longest edge any
 * shipped aspect produces at the finest tier (3840, which is 4K UHD's long edge).
 * Add a wider aspect or a higher tier and the ceiling rises with it, instead of
 * silently clamping the very preset that was just shipped.
 */
export const MAX_RENDER_DIMENSION = ASPECT_LABELS.flatMap((aspect) =>
	RESOLUTION_TIERS.map((tier) => dimensionsFor(aspect, tier)),
).reduce((widest, { width, height }) => Math.max(widest, width, height), 0);

/** Keeps a zero, a negative or a one-pixel frame out of the encoder. */
export const MIN_RENDER_DIMENSION = 16;

/**
 * The one size rule every render path applies, on each axis: an even integer
 * inside the shared bounds. Even because 4:2:0 chroma is subsampled by two, so
 * an odd edge holds half a chroma sample and encoders refuse it. A rule rather
 * than a list of sizes, because a list admitted 16:9 and refused the 4:5 and 3:4
 * presets the studio ships.
 */
export function isRenderDimension(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= MIN_RENDER_DIMENSION &&
		value <= MAX_RENDER_DIMENSION &&
		value % 2 === 0
	);
}

/**
 * What the synchronous route does with an untrusted edge: clamp it into the
 * bounds, then round down to even, so a size the rule allows passes untouched
 * and any other lands on the nearest size it would allow.
 */
export function clampRenderDimension(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	const clamped = Math.min(MAX_RENDER_DIMENSION, Math.max(MIN_RENDER_DIMENSION, value));
	return Math.floor(clamped / 2) * 2;
}

export interface RenderConfigProps {
	width: number;
	height: number;
	fps: number;
	format: RenderFormat;
}

export class RenderConfig {
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly format: RenderFormat;

	private constructor(props: RenderConfigProps) {
		this.width = props.width;
		this.height = props.height;
		this.fps = props.fps;
		this.format = props.format;
	}

	static create(props: RenderConfigProps): RenderConfig {
		if (props.width <= 0 || props.height <= 0) {
			throw new Error("Dimensions must be positive");
		}
		// H.264 and VP9 both require even dimensions. Catching it here turns a
		// failure deep inside ffmpeg into a failure at the boundary.
		if (!Number.isInteger(props.width / 2) || !Number.isInteger(props.height / 2)) {
			throw new Error("Dimensions must be even");
		}
		if (props.fps <= 0) {
			throw new Error("FPS must be positive");
		}
		if (!VALID_FORMATS.includes(props.format)) {
			throw new Error(
				`Invalid format: ${props.format}. Must be one of: ${VALID_FORMATS.join(", ")}`,
			);
		}
		return new RenderConfig(props);
	}

	static defaults(): RenderConfig {
		return new RenderConfig({
			width: 1920,
			height: 1080,
			fps: 60,
			format: "mp4",
		});
	}
}
