const VALID_FORMATS = ["mp4", "gif", "webm"] as const;
export type RenderFormat = (typeof VALID_FORMATS)[number];

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
 * 3840 is 4K UHD on the long edge — the top of the shipped resolution presets.
 * The floor keeps a zero, a negative or a one-pixel frame out of the encoder.
 */
export const MAX_RENDER_DIMENSION = 3840;
export const MIN_RENDER_DIMENSION = 16;

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
