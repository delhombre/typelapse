// Throwaway: domain-only change (#302).
export type AssetKind = "image" | "video" | "audio";

interface AssetMetadataBase {
	readonly fileName: string;
	readonly mimeType: string;
	readonly byteSize: number;
	readonly checksum: string;
}

export interface ImageAssetMetadata extends AssetMetadataBase {
	readonly kind: "image";
	readonly width: number;
	readonly height: number;
}

export interface VideoAssetMetadata extends AssetMetadataBase {
	readonly kind: "video";
	readonly width: number;
	readonly height: number;
	readonly durationMs: number;
}

export interface AudioAssetMetadata extends AssetMetadataBase {
	readonly kind: "audio";
	readonly durationMs: number;
}

/** Serializable metadata only. Media bytes live behind an infrastructure port. */
export type AssetMetadata = ImageAssetMetadata | VideoAssetMetadata | AudioAssetMetadata;

export type AssetCreateProps = AssetMetadata & { readonly id?: string };

function isPositiveInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function assertCommonMetadata(props: AssetCreateProps): void {
	if (props.id !== undefined && !props.id.trim()) {
		throw new Error("Asset id must not be empty");
	}
	if (!props.fileName.trim()) {
		throw new Error("Asset file name must not be empty");
	}
	if (!isPositiveInteger(props.byteSize)) {
		throw new Error("Asset byte size must be a positive integer");
	}
	if (!props.checksum.trim()) {
		throw new Error("Asset checksum must not be empty");
	}
	if (!props.mimeType.startsWith(`${props.kind}/`) || props.mimeType === `${props.kind}/`) {
		const label = props.kind[0]?.toUpperCase() + props.kind.slice(1);
		throw new Error(`${label} asset MIME type must start with ${props.kind}/`);
	}
	if (props.mimeType.toLowerCase() === "image/svg+xml") {
		throw new Error("SVG assets are not supported");
	}
}

function assertDimensions(kind: "image" | "video", width: number, height: number): void {
	if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
		const label = kind === "image" ? "Image" : "Video";
		throw new Error(`${label} dimensions must be positive integers`);
	}
}

function assertDuration(kind: "video" | "audio", durationMs: number): void {
	if (!isPositiveInteger(durationMs)) {
		const label = kind === "video" ? "Video" : "Audio";
		throw new Error(`${label} duration must be a positive integer`);
	}
}

function metadataFrom(props: AssetCreateProps): AssetMetadata {
	switch (props.kind) {
		case "image":
			assertDimensions(props.kind, props.width, props.height);
			return Object.freeze({
				kind: props.kind,
				fileName: props.fileName,
				mimeType: props.mimeType,
				byteSize: props.byteSize,
				checksum: props.checksum,
				width: props.width,
				height: props.height,
			});
		case "video":
			assertDimensions(props.kind, props.width, props.height);
			assertDuration(props.kind, props.durationMs);
			return Object.freeze({
				kind: props.kind,
				fileName: props.fileName,
				mimeType: props.mimeType,
				byteSize: props.byteSize,
				checksum: props.checksum,
				width: props.width,
				height: props.height,
				durationMs: props.durationMs,
			});
		case "audio":
			assertDuration(props.kind, props.durationMs);
			return Object.freeze({
				kind: props.kind,
				fileName: props.fileName,
				mimeType: props.mimeType,
				byteSize: props.byteSize,
				checksum: props.checksum,
				durationMs: props.durationMs,
			});
	}
}

/** An immutable asset identity plus the metadata needed to resolve its bytes elsewhere. */
export class Asset {
	readonly id: string;
	readonly metadata: AssetMetadata;

	private constructor(id: string, metadata: AssetMetadata) {
		this.id = id;
		this.metadata = metadata;
		Object.freeze(this);
	}

	get kind(): AssetKind {
		return this.metadata.kind;
	}

	static create(props: AssetCreateProps): Asset {
		assertCommonMetadata(props);
		return new Asset(props.id ?? crypto.randomUUID(), metadataFrom(props));
	}
}
