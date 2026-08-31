import { Asset, type AssetKind } from "../../domain/entities/asset";
import {
	type PrivateMediaFile,
	type PrivateMediaMetadataPort,
	type PrivateMediaSha256Port,
	PrivateMediaUploadError,
} from "./private-media-upload.port";
import type {
	LocalSceneAssetSourceFactoryPort,
	SceneAssetSource,
	SceneAssetSourceLease,
	SceneAssetSourceRegistryPort,
} from "./scene-asset-source.port";

export interface ImportLocalMediaInput {
	readonly file: PrivateMediaFile;
}

export interface ImportLocalMediaOptions {
	readonly signal?: AbortSignal;
}

export interface ImportLocalMediaResult {
	readonly asset: Asset;
	readonly source: SceneAssetSource;
}

export interface ImportLocalMediaDependencies {
	readonly hasher: PrivateMediaSha256Port;
	readonly metadata: PrivateMediaMetadataPort;
	readonly sourceFactory: LocalSceneAssetSourceFactoryPort;
	readonly registry: SceneAssetSourceRegistryPort;
	readonly createAssetId?: () => string;
}

export interface ImportLocalMedia {
	execute(
		input: ImportLocalMediaInput,
		options?: ImportLocalMediaOptions,
	): Promise<ImportLocalMediaResult>;
}

function abortError(): Error {
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw abortError();
	}
}

function positiveInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function mediaKind(file: PrivateMediaFile): AssetKind {
	const mimeType = file.mimeType.trim().toLowerCase();
	if (mimeType.startsWith("image/svg") || file.name.trim().toLowerCase().endsWith(".svg")) {
		throw new PrivateMediaUploadError("unsupported-media-type", "SVG media is not supported.");
	}
	if (mimeType.startsWith("image/")) {
		return "image";
	}
	if (mimeType.startsWith("video/")) {
		return "video";
	}
	if (mimeType.startsWith("audio/")) {
		return "audio";
	}
	throw new PrivateMediaUploadError(
		"unsupported-media-type",
		"Choose a supported image, video, or audio file.",
	);
}

function assertFile(file: PrivateMediaFile): AssetKind {
	if (
		!file.name.trim() ||
		!file.mimeType.trim() ||
		!positiveInteger(file.byteSize) ||
		file.opaqueHandle === null ||
		file.opaqueHandle === undefined
	) {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file is invalid.");
	}
	return mediaKind(file);
}

function releaseSafely(lease: SceneAssetSourceLease): void {
	try {
		lease.release();
	} catch {}
}

function invalidMetadata(): never {
	throw new PrivateMediaUploadError(
		"invalid-metadata",
		"The media metadata could not be verified.",
	);
}

export function createImportLocalMedia({
	hasher,
	metadata,
	sourceFactory,
	registry,
	createAssetId,
}: ImportLocalMediaDependencies): ImportLocalMedia {
	return {
		async execute({ file }, options = {}) {
			const kind = assertFile(file);
			throwIfAborted(options.signal);
			const checksum = await hasher.sha256(file, { signal: options.signal });
			throwIfAborted(options.signal);
			if (!/^[0-9a-f]{64}$/.test(checksum)) {
				throw new PrivateMediaUploadError(
					"invalid-metadata",
					"The media checksum could not be verified.",
				);
			}

			throwIfAborted(options.signal);
			const inspection = await metadata.inspect(file, { signal: options.signal });
			throwIfAborted(options.signal);
			const common = {
				...(createAssetId ? { id: createAssetId() } : {}),
				fileName: file.name,
				mimeType: file.mimeType.trim().toLowerCase(),
				byteSize: file.byteSize,
				checksum,
			};
			let asset: Asset;
			if (
				kind === "image" &&
				inspection.kind === "image" &&
				positiveInteger(inspection.width) &&
				positiveInteger(inspection.height)
			) {
				asset = Asset.create({
					...common,
					kind,
					width: inspection.width,
					height: inspection.height,
				});
			} else if (
				kind === "video" &&
				inspection.kind === "video" &&
				positiveInteger(inspection.width) &&
				positiveInteger(inspection.height) &&
				positiveInteger(inspection.durationMs)
			) {
				asset = Asset.create({
					...common,
					kind,
					width: inspection.width,
					height: inspection.height,
					durationMs: inspection.durationMs,
				});
			} else if (
				kind === "audio" &&
				inspection.kind === "audio" &&
				positiveInteger(inspection.durationMs)
			) {
				asset = Asset.create({
					...common,
					kind,
					durationMs: inspection.durationMs,
				});
			} else {
				invalidMetadata();
			}

			let lease: SceneAssetSourceLease | null = null;
			let registered = false;
			try {
				throwIfAborted(options.signal);
				lease = sourceFactory.create(asset.id, file, { signal: options.signal });
				throwIfAborted(options.signal);
				if (lease.source.assetId !== asset.id || !lease.source.src.trim()) {
					throw new PrivateMediaUploadError(
						"invalid-response",
						"A local preview source could not be registered.",
					);
				}
				const source = registry.register(lease);
				registered = true;
				throwIfAborted(options.signal);
				return { asset, source };
			} catch (error) {
				if (lease) {
					if (registered) {
						registry.revoke(asset.id);
					} else {
						releaseSafely(lease);
					}
				}
				throw error;
			}
		},
	};
}
