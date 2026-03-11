const VALID_FORMATS = ["mp4", "gif", "webm"] as const;
export type RenderFormat = (typeof VALID_FORMATS)[number];

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
