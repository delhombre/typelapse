export type BlockKind = "code" | "text" | "image" | "video";

/** Geometry is relative to the canvas, so documents survive aspect/resolution changes. */
export interface BlockPlacement {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface BlockBaseCreateProps {
	readonly id?: string;
	readonly placement?: BlockPlacement;
	readonly opacity?: number;
	readonly continuityKey?: string;
}

interface NormalizedBlockBase {
	readonly id: string;
	readonly placement: Readonly<BlockPlacement>;
	readonly opacity: number;
	readonly continuityKey?: string;
}

const FULL_CANVAS_PLACEMENT: BlockPlacement = { x: 0, y: 0, width: 1, height: 1 };

function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value);
}

function normalizeBlockBase(props: BlockBaseCreateProps): NormalizedBlockBase {
	if (props.id !== undefined && !props.id.trim()) {
		throw new Error("Block id must not be empty");
	}
	const placement = props.placement ?? FULL_CANVAS_PLACEMENT;
	if (
		!isFiniteNumber(placement.x) ||
		!isFiniteNumber(placement.y) ||
		!isFiniteNumber(placement.width) ||
		!isFiniteNumber(placement.height) ||
		placement.x < 0 ||
		placement.y < 0 ||
		placement.width <= 0 ||
		placement.height <= 0 ||
		placement.x + placement.width > 1 ||
		placement.y + placement.height > 1
	) {
		throw new Error("Block placement must stay inside the normalized canvas");
	}
	const opacity = props.opacity ?? 1;
	if (!isFiniteNumber(opacity) || opacity < 0 || opacity > 1) {
		throw new Error("Block opacity must be between 0 and 1");
	}
	if (props.continuityKey !== undefined && !props.continuityKey.trim()) {
		throw new Error("Block continuity key must not be empty");
	}
	return {
		id: props.id ?? crypto.randomUUID(),
		placement: Object.freeze({ ...placement }),
		opacity,
		continuityKey: props.continuityKey?.trim(),
	};
}

abstract class BlockEntity<K extends BlockKind> {
	readonly id: string;
	readonly kind: K;
	readonly placement: Readonly<BlockPlacement>;
	readonly opacity: number;
	readonly continuityKey?: string;

	protected constructor(kind: K, props: BlockBaseCreateProps) {
		const base = normalizeBlockBase(props);
		this.id = base.id;
		this.kind = kind;
		this.placement = base.placement;
		this.opacity = base.opacity;
		this.continuityKey = base.continuityKey;
	}
}

export const CODE_WINDOW_CHROMES = ["macos", "browser", "terminal", "none"] as const;
export type CodeWindowChrome = (typeof CODE_WINDOW_CHROMES)[number];

export interface CodeBlockCreateProps extends BlockBaseCreateProps {
	readonly code: string;
	readonly language: string;
	readonly themeName?: string;
	readonly fontFamily?: string;
	readonly borderRadius?: number;
	/** Compact line grammar inherited from V1, for example `2-4, 7`. */
	readonly focus?: string;
	readonly chrome?: CodeWindowChrome;
	readonly showLineNumbers?: boolean;
	readonly lineNumberStart?: number;
	readonly framePadding?: number;
	readonly cardMargin?: number;
}

function normalizeFocus(focus: string | undefined): string | undefined {
	if (focus === undefined) {
		return undefined;
	}
	const trimmed = focus.trim();
	if (!trimmed) {
		return undefined;
	}
	const parts = trimmed.split(",");
	for (const part of parts) {
		const match = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(part.trim());
		if (!match) {
			throw new Error("Code block focus must use line ranges such as '2-4, 7'");
		}
		const start = Number(match[1]);
		const end = Number(match[2] ?? match[1]);
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) {
			throw new Error("Code block focus must use ascending safe line ranges");
		}
	}
	return parts.map((part) => part.trim()).join(", ");
}

function assertNonNegativeFinite(value: number, label: string): void {
	if (!isFiniteNumber(value) || value < 0) {
		throw new Error(`${label} must be a non-negative number`);
	}
}

export class CodeBlock extends BlockEntity<"code"> {
	readonly code: string;
	readonly language: string;
	readonly themeName: string;
	readonly fontFamily: string;
	readonly borderRadius: number;
	readonly focus?: string;
	readonly chrome: CodeWindowChrome;
	readonly showLineNumbers: boolean;
	readonly lineNumberStart: number;
	readonly framePadding: number;
	readonly cardMargin: number;

	private constructor(props: CodeBlockCreateProps) {
		super("code", props);
		if (!props.code.trim()) {
			throw new Error("Code block code must not be empty");
		}
		if (!props.language.trim()) {
			throw new Error("Code block language must not be empty");
		}
		const themeName = props.themeName ?? "midnight";
		if (!themeName.trim()) {
			throw new Error("Code block theme name must not be empty");
		}
		const fontFamily = props.fontFamily ?? "JetBrains Mono, monospace";
		if (!fontFamily.trim()) {
			throw new Error("Code block font family must not be empty");
		}
		const borderRadius = props.borderRadius ?? 12;
		const framePadding = props.framePadding ?? 24;
		const cardMargin = props.cardMargin ?? 32;
		assertNonNegativeFinite(borderRadius, "Code block border radius");
		assertNonNegativeFinite(framePadding, "Code block frame padding");
		assertNonNegativeFinite(cardMargin, "Code block card margin");
		const chrome = props.chrome ?? "macos";
		if (!CODE_WINDOW_CHROMES.includes(chrome)) {
			throw new Error(`Unsupported code window chrome '${chrome}'`);
		}
		const lineNumberStart = props.lineNumberStart ?? 1;
		if (!Number.isSafeInteger(lineNumberStart) || lineNumberStart < 1) {
			throw new Error("Code block line-number start must be a positive integer");
		}
		this.code = props.code;
		this.language = props.language;
		this.themeName = themeName;
		this.fontFamily = fontFamily;
		this.borderRadius = borderRadius;
		this.focus = normalizeFocus(props.focus);
		this.chrome = chrome;
		this.showLineNumbers = props.showLineNumbers ?? true;
		this.lineNumberStart = lineNumberStart;
		this.framePadding = framePadding;
		this.cardMargin = cardMargin;
		Object.freeze(this);
	}

	static create(props: CodeBlockCreateProps): CodeBlock {
		return new CodeBlock(props);
	}
}

export const TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export interface TextTypography {
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly fontWeight: number;
	readonly color: string;
	readonly align: TextAlignment;
}

export interface TextBlockCreateProps extends BlockBaseCreateProps {
	readonly text: string;
	readonly typography: TextTypography;
}

function normalizeTypography(typography: TextTypography): Readonly<TextTypography> {
	if (!typography.fontFamily.trim()) {
		throw new Error("Text typography font family must not be empty");
	}
	if (!isFiniteNumber(typography.fontSize) || typography.fontSize <= 0) {
		throw new Error("Text typography font size must be positive");
	}
	if (
		!Number.isSafeInteger(typography.fontWeight) ||
		typography.fontWeight < 1 ||
		typography.fontWeight > 1_000
	) {
		throw new Error("Text typography font weight must be an integer between 1 and 1000");
	}
	if (!typography.color.trim()) {
		throw new Error("Text typography color must not be empty");
	}
	if (!TEXT_ALIGNMENTS.includes(typography.align)) {
		throw new Error(`Unsupported text alignment '${typography.align}'`);
	}
	return Object.freeze({ ...typography });
}

export class TextBlock extends BlockEntity<"text"> {
	readonly text: string;
	readonly typography: Readonly<TextTypography>;

	private constructor(props: TextBlockCreateProps) {
		super("text", props);
		if (!props.text.trim()) {
			throw new Error("Text block text must not be empty");
		}
		this.text = props.text;
		this.typography = normalizeTypography(props.typography);
		Object.freeze(this);
	}

	static create(props: TextBlockCreateProps): TextBlock {
		return new TextBlock(props);
	}
}

export const MEDIA_FITS = ["cover", "contain"] as const;
export type MediaFit = (typeof MEDIA_FITS)[number];
export const MAX_MEDIA_BORDER_RADIUS = 160;

export interface MediaFocalPoint {
	readonly x: number;
	readonly y: number;
}

interface MediaBlockCreateProps extends BlockBaseCreateProps {
	readonly assetId: string;
	readonly fit?: MediaFit;
	readonly focalPoint?: MediaFocalPoint;
	readonly borderRadius?: number;
}

interface NormalizedMediaProps {
	readonly assetId: string;
	readonly fit: MediaFit;
	readonly focalPoint: Readonly<MediaFocalPoint>;
	readonly borderRadius: number;
}

function normalizeMediaProps(
	kind: "image" | "video",
	props: MediaBlockCreateProps,
): NormalizedMediaProps {
	if (!props.assetId.trim()) {
		const label = kind === "image" ? "Image" : "Video";
		throw new Error(`${label} block asset id must not be empty`);
	}
	const fit = props.fit ?? "cover";
	if (!MEDIA_FITS.includes(fit)) {
		throw new Error(`Unsupported media fit '${fit}'`);
	}
	const focalPoint = props.focalPoint ?? { x: 0.5, y: 0.5 };
	if (
		!isFiniteNumber(focalPoint.x) ||
		!isFiniteNumber(focalPoint.y) ||
		focalPoint.x < 0 ||
		focalPoint.x > 1 ||
		focalPoint.y < 0 ||
		focalPoint.y > 1
	) {
		throw new Error("Media focal point must be between 0 and 1");
	}
	const borderRadius = props.borderRadius ?? 0;
	if (!isFiniteNumber(borderRadius) || borderRadius < 0 || borderRadius > MAX_MEDIA_BORDER_RADIUS) {
		throw new Error(`Media border radius must be between 0 and ${MAX_MEDIA_BORDER_RADIUS}`);
	}
	return {
		assetId: props.assetId,
		fit,
		focalPoint: Object.freeze({ ...focalPoint }),
		borderRadius,
	};
}

export interface ImageBlockCreateProps extends MediaBlockCreateProps {}

export class ImageBlock extends BlockEntity<"image"> {
	readonly assetId: string;
	readonly fit: MediaFit;
	readonly focalPoint: Readonly<MediaFocalPoint>;
	readonly borderRadius: number;

	private constructor(props: ImageBlockCreateProps) {
		super("image", props);
		const media = normalizeMediaProps("image", props);
		this.assetId = media.assetId;
		this.fit = media.fit;
		this.focalPoint = media.focalPoint;
		this.borderRadius = media.borderRadius;
		Object.freeze(this);
	}

	static create(props: ImageBlockCreateProps): ImageBlock {
		return new ImageBlock(props);
	}
}

export interface VideoTrim {
	readonly startMs: number;
	readonly endMs: number;
}

export interface VideoBlockCreateProps extends MediaBlockCreateProps {
	readonly trim: VideoTrim;
	readonly playbackRate?: number;
	readonly muted?: boolean;
}

export class VideoBlock extends BlockEntity<"video"> {
	readonly assetId: string;
	readonly fit: MediaFit;
	readonly focalPoint: Readonly<MediaFocalPoint>;
	readonly borderRadius: number;
	readonly trim: Readonly<VideoTrim>;
	readonly playbackRate: number;
	readonly muted: boolean;

	private constructor(props: VideoBlockCreateProps) {
		super("video", props);
		const media = normalizeMediaProps("video", props);
		if (
			!Number.isSafeInteger(props.trim.startMs) ||
			!Number.isSafeInteger(props.trim.endMs) ||
			props.trim.startMs < 0 ||
			props.trim.endMs <= props.trim.startMs
		) {
			throw new Error("Video trim must have a non-negative start before its end");
		}
		const playbackRate = props.playbackRate ?? 1;
		if (!isFiniteNumber(playbackRate) || playbackRate <= 0) {
			throw new Error("Video playback rate must be positive");
		}
		this.assetId = media.assetId;
		this.fit = media.fit;
		this.focalPoint = media.focalPoint;
		this.borderRadius = media.borderRadius;
		this.trim = Object.freeze({ ...props.trim });
		this.playbackRate = playbackRate;
		this.muted = props.muted ?? true;
		Object.freeze(this);
	}

	static create(props: VideoBlockCreateProps): VideoBlock {
		return new VideoBlock(props);
	}
}

export type Block = CodeBlock | TextBlock | ImageBlock | VideoBlock;
