import type { AssetMetadata } from "../../domain/entities/asset";

/**
 * A transient browser-owned media value. Application code may read the safe
 * descriptors, but only infrastructure adapters may unwrap `opaqueHandle`.
 */
export interface PrivateMediaFile {
	readonly name: string;
	readonly mimeType: string;
	readonly byteSize: number;
	readonly opaqueHandle: unknown;
}

export interface ByteProgress {
	readonly loadedBytes: number;
	readonly totalBytes: number;
}

export interface PrivateMediaPortOptions {
	readonly signal?: AbortSignal;
}

export interface PrivateMediaHashOptions extends PrivateMediaPortOptions {
	readonly onProgress?: (progress: ByteProgress) => void;
}

export interface PrivateMediaSha256Port {
	sha256(file: PrivateMediaFile, options: PrivateMediaHashOptions): Promise<string>;
}

export type PrivateMediaInspection =
	| {
			readonly kind: "image";
			readonly width: number;
			readonly height: number;
	  }
	| {
			readonly kind: "video";
			readonly width: number;
			readonly height: number;
			readonly durationMs: number;
	  }
	| {
			readonly kind: "audio";
			readonly durationMs: number;
	  };

export interface PrivateMediaMetadataPort {
	inspect(
		file: PrivateMediaFile,
		options: PrivateMediaPortOptions,
	): Promise<PrivateMediaInspection>;
}

export type PrivateAssetUploadStatus = "pending" | "ready" | "failed";

export interface PrivateAssetSnapshot {
	readonly id: string;
	readonly projectId: string;
	readonly metadata: AssetMetadata;
	readonly status: PrivateAssetUploadStatus;
}

export interface SignedPutContract {
	readonly method: "PUT";
	readonly url: string;
	/** Every entry is signed. The PUT adapter must add no application header. */
	readonly headers: Readonly<Record<string, string>>;
	readonly checksum: {
		readonly algorithm: "sha256";
		readonly value: string;
	};
	readonly expiresAt: Date;
}

export interface PrivateAssetAccess {
	readonly method: "GET";
	readonly url: string;
	readonly expiresAt: Date;
}

export interface ReservePrivateAssetInput {
	readonly projectId: string;
	readonly metadata: AssetMetadata;
	readonly idempotencyKey: string;
}

export interface FinalizePrivateAssetInput {
	readonly assetId: string;
	readonly idempotencyKey: string;
}

export interface ResolvePrivateAssetContentInput {
	readonly assetId: string;
}

export interface PrivateAssetApiPort {
	reserve(
		input: ReservePrivateAssetInput,
		options: PrivateMediaPortOptions,
	): Promise<{
		readonly asset: PrivateAssetSnapshot;
		readonly upload: SignedPutContract;
	}>;
	finalize(
		input: FinalizePrivateAssetInput,
		options: PrivateMediaPortOptions,
	): Promise<{ readonly asset: PrivateAssetSnapshot }>;
	resolveContent(
		input: ResolvePrivateAssetContentInput,
		options: PrivateMediaPortOptions,
	): Promise<PrivateAssetAccess>;
}

export interface SignedPutOptions extends PrivateMediaPortOptions {
	readonly onProgress?: (progress: ByteProgress) => void;
}

export interface SignedPutPort {
	put(file: PrivateMediaFile, upload: SignedPutContract, options: SignedPutOptions): Promise<void>;
}

export type PrivateMediaUploadErrorCode =
	| "invalid-file"
	| "unsupported-media-type"
	| "invalid-metadata"
	| "invalid-idempotency-key"
	| "idempotency-key-collision"
	| "signed-upload-mismatch"
	| "invalid-response"
	| "unauthorized"
	| "rejected"
	| "unavailable"
	| "upload-failed";

/** Stable, deliberately non-reflective client error. */
export class PrivateMediaUploadError extends Error {
	readonly code: PrivateMediaUploadErrorCode;
	readonly status?: number;

	constructor(code: PrivateMediaUploadErrorCode, message: string, status?: number) {
		super(message);
		this.name = "PrivateMediaUploadError";
		this.code = code;
		this.status = status;
	}
}
