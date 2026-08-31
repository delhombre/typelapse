import type { AssetKind, AssetMetadata } from "../../domain/entities/asset";
import {
	type PrivateAssetApiPort,
	type PrivateAssetSnapshot,
	type PrivateMediaFile,
	type PrivateMediaInspection,
	type PrivateMediaMetadataPort,
	type PrivateMediaSha256Port,
	PrivateMediaUploadError,
	type SignedPutPort,
} from "./private-media-upload.port";

export type PrivateMediaUploadPhase =
	| "hashing"
	| "inspecting"
	| "reserving"
	| "uploading"
	| "finalizing"
	| "resolving"
	| "complete";

export interface PrivateMediaUploadProgress {
	readonly phase: PrivateMediaUploadPhase;
	readonly loadedBytes?: number;
	readonly totalBytes?: number;
}

export interface UploadPrivateMediaInput {
	readonly file: PrivateMediaFile;
	readonly projectId: string;
}

export interface UploadPrivateMediaOptions {
	readonly signal?: AbortSignal;
	readonly onProgress?: (progress: PrivateMediaUploadProgress) => void;
}

export interface UploadPrivateMediaDependencies {
	readonly hasher: PrivateMediaSha256Port;
	readonly metadata: PrivateMediaMetadataPort;
	readonly api: PrivateAssetApiPort;
	readonly uploader: SignedPutPort;
	readonly createIdempotencyKey: () => string;
}

export interface UploadedPrivateMedia {
	readonly asset: PrivateAssetSnapshot;
	/** Ephemeral private access. Persist the asset id, never this URL. */
	readonly access: {
		readonly method: "GET";
		readonly url: string;
		readonly expiresAt: Date;
	};
}

export interface UploadPrivateMedia {
	execute(
		input: UploadPrivateMediaInput,
		options?: UploadPrivateMediaOptions,
	): Promise<UploadedPrivateMedia>;
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

function mediaKindFromMimeType(mimeType: string): AssetKind {
	const normalized = mimeType.trim().toLowerCase();
	if (normalized === "image/svg+xml") {
		throw new PrivateMediaUploadError("unsupported-media-type", "SVG media is not supported.");
	}
	if (normalized.startsWith("image/")) return "image";
	if (normalized.startsWith("video/")) return "video";
	if (normalized.startsWith("audio/")) return "audio";
	throw new PrivateMediaUploadError(
		"unsupported-media-type",
		"Choose a supported image, video, or audio file.",
	);
}

function validateFile(file: PrivateMediaFile, projectId: string): AssetKind {
	if (!projectId.trim()) {
		throw new PrivateMediaUploadError("invalid-file", "A project is required for this upload.");
	}
	if (!file.name.trim() || !file.mimeType.trim() || !positiveInteger(file.byteSize)) {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file is invalid.");
	}
	if (file.opaqueHandle === null || file.opaqueHandle === undefined) {
		throw new PrivateMediaUploadError("invalid-file", "The selected media file is unavailable.");
	}
	return mediaKindFromMimeType(file.mimeType);
}

function validateInspection(expectedKind: AssetKind, inspection: PrivateMediaInspection): void {
	if (inspection.kind !== expectedKind) {
		throw new PrivateMediaUploadError(
			"invalid-metadata",
			"The media contents do not match the selected file type.",
		);
	}
	if (inspection.kind === "image") {
		if (!positiveInteger(inspection.width) || !positiveInteger(inspection.height)) {
			throw new PrivateMediaUploadError("invalid-metadata", "The image dimensions are invalid.");
		}
		return;
	}
	if (inspection.kind === "video") {
		if (
			!positiveInteger(inspection.width) ||
			!positiveInteger(inspection.height) ||
			!positiveInteger(inspection.durationMs)
		) {
			throw new PrivateMediaUploadError("invalid-metadata", "The video metadata is invalid.");
		}
		return;
	}
	if (!positiveInteger(inspection.durationMs)) {
		throw new PrivateMediaUploadError("invalid-metadata", "The audio duration is invalid.");
	}
}

function assetMetadata(
	file: PrivateMediaFile,
	checksum: string,
	inspection: PrivateMediaInspection,
): AssetMetadata {
	const common = {
		fileName: file.name,
		mimeType: file.mimeType.trim().toLowerCase(),
		byteSize: file.byteSize,
		checksum,
	};
	if (inspection.kind === "image") {
		return { ...common, kind: inspection.kind, width: inspection.width, height: inspection.height };
	}
	if (inspection.kind === "video") {
		return {
			...common,
			kind: inspection.kind,
			width: inspection.width,
			height: inspection.height,
			durationMs: inspection.durationMs,
		};
	}
	return { ...common, kind: inspection.kind, durationMs: inspection.durationMs };
}

function idempotencyKey(create: () => string): string {
	const key = create();
	if (!key || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
		throw new PrivateMediaUploadError(
			"invalid-idempotency-key",
			"A safe upload request key could not be created.",
		);
	}
	return key;
}

function assertChecksum(checksum: string): void {
	if (!/^[0-9a-f]{64}$/.test(checksum)) {
		throw new PrivateMediaUploadError(
			"invalid-metadata",
			"The media checksum could not be verified.",
		);
	}
}

function emitProgress(options: UploadPrivateMediaOptions, event: PrivateMediaUploadProgress): void {
	throwIfAborted(options.signal);
	options.onProgress?.(event);
}

export function createUploadPrivateMedia({
	hasher,
	metadata,
	api,
	uploader,
	createIdempotencyKey,
}: UploadPrivateMediaDependencies): UploadPrivateMedia {
	return {
		async execute(input, options = {}) {
			const expectedKind = validateFile(input.file, input.projectId);
			const signalOptions = { signal: options.signal };

			emitProgress(options, { phase: "hashing" });
			throwIfAborted(options.signal);
			const checksum = await hasher.sha256(input.file, {
				...signalOptions,
				onProgress: (progress) => {
					emitProgress(options, { phase: "hashing", ...progress });
				},
			});
			throwIfAborted(options.signal);
			assertChecksum(checksum);

			emitProgress(options, { phase: "inspecting" });
			throwIfAborted(options.signal);
			const inspection = await metadata.inspect(input.file, signalOptions);
			throwIfAborted(options.signal);
			validateInspection(expectedKind, inspection);
			const serializedMetadata = assetMetadata(input.file, checksum, inspection);

			const reserveKey = idempotencyKey(createIdempotencyKey);
			emitProgress(options, { phase: "reserving" });
			throwIfAborted(options.signal);
			const reservation = await api.reserve(
				{
					projectId: input.projectId.trim(),
					metadata: serializedMetadata,
					idempotencyKey: reserveKey,
				},
				signalOptions,
			);
			throwIfAborted(options.signal);
			if (
				reservation.upload.checksum.algorithm !== "sha256" ||
				reservation.upload.checksum.value !== checksum
			) {
				throw new PrivateMediaUploadError(
					"signed-upload-mismatch",
					"The signed upload does not match the selected media.",
				);
			}

			emitProgress(options, { phase: "uploading" });
			throwIfAborted(options.signal);
			await uploader.put(input.file, reservation.upload, {
				...signalOptions,
				onProgress: (progress) => {
					emitProgress(options, { phase: "uploading", ...progress });
				},
			});
			throwIfAborted(options.signal);

			const finalizeKey = idempotencyKey(createIdempotencyKey);
			if (finalizeKey === reserveKey) {
				throw new PrivateMediaUploadError(
					"idempotency-key-collision",
					"The upload could not create a distinct finalization request.",
				);
			}
			emitProgress(options, { phase: "finalizing" });
			throwIfAborted(options.signal);
			const finalized = await api.finalize(
				{ assetId: reservation.asset.id, idempotencyKey: finalizeKey },
				signalOptions,
			);
			throwIfAborted(options.signal);
			if (finalized.asset.id !== reservation.asset.id || finalized.asset.status !== "ready") {
				throw new PrivateMediaUploadError(
					"invalid-response",
					"The asset service returned an invalid finalization response.",
				);
			}

			emitProgress(options, { phase: "resolving" });
			throwIfAborted(options.signal);
			const access = await api.resolveContent({ assetId: finalized.asset.id }, signalOptions);
			throwIfAborted(options.signal);
			if (access.method !== "GET" || !access.url || Number.isNaN(access.expiresAt.getTime())) {
				throw new PrivateMediaUploadError(
					"invalid-response",
					"The asset service returned invalid private access.",
				);
			}

			emitProgress(options, { phase: "complete" });
			return { asset: finalized.asset, access };
		},
	};
}
