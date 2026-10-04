import type { AssetKind, AssetMetadata } from "../../domain/entities/asset";
import type { AccountId } from "../../domain/ports/auth.port";
import type { AssetFailureCode, AssetRecord, AssetRepositoryPort } from "./asset-repository.port";
import type { ObjectStoragePort, SignedGetObject, SignedPutUpload } from "./object-storage.port";

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

export interface AssetIngestionPolicy {
	readonly allowedMimeTypes: Readonly<Record<AssetKind, readonly string[]>>;
	readonly maxBytesByKind: Readonly<Record<AssetKind, number>>;
	readonly maxOwnerStorageBytes: number;
	readonly uploadUrlTtlSeconds: number;
	readonly readUrlTtlSeconds: number;
}

export const DEFAULT_ASSET_INGESTION_POLICY: AssetIngestionPolicy = {
	allowedMimeTypes: {
		image: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"],
		video: ["video/mp4", "video/webm", "video/quicktime"],
		audio: [
			"audio/mpeg",
			"audio/mp4",
			"audio/wav",
			"audio/x-wav",
			"audio/webm",
			"audio/ogg",
			"audio/flac",
		],
	},
	maxBytesByKind: {
		image: 25 * MEBIBYTE,
		video: 2 * GIBIBYTE,
		audio: 250 * MEBIBYTE,
	},
	maxOwnerStorageBytes: 10 * GIBIBYTE,
	uploadUrlTtlSeconds: 15 * 60,
	readUrlTtlSeconds: 5 * 60,
};

export type AssetIngestionErrorCode =
	| "invalid-metadata"
	| "unsupported-media-type"
	| "asset-too-large"
	| "quota-exceeded"
	| "not-found"
	| "idempotency-conflict"
	| "upload-missing"
	| "upload-integrity-failed"
	| "invalid-state"
	| "asset-referenced";

export class AssetIngestionError extends Error {
	readonly code: AssetIngestionErrorCode;
	readonly details?: Readonly<Record<string, string | number>>;

	constructor(
		code: AssetIngestionErrorCode,
		message: string,
		details?: Readonly<Record<string, string | number>>,
	) {
		super(message);
		this.name = "AssetIngestionError";
		this.code = code;
		this.details = details;
	}
}

export interface ReserveAssetRequest {
	readonly ownerId: AccountId;
	readonly projectId: unknown;
	readonly idempotencyKey: string;
	readonly metadata: unknown;
	/** The account plan's media allowance; the policy's ceiling still caps it. */
	readonly maxOwnerStorageBytes?: number;
}

export interface ReserveAssetResponse {
	readonly asset: AssetRecord;
	readonly upload: SignedPutUpload;
	readonly replayed: boolean;
}

export interface FinalizeAssetRequest {
	readonly ownerId: AccountId;
	readonly id: string;
	readonly idempotencyKey: string;
}

export interface AssetIngestionService {
	reserve(input: ReserveAssetRequest): Promise<ReserveAssetResponse>;
	finalize(
		input: FinalizeAssetRequest,
	): Promise<{ readonly asset: AssetRecord; readonly replayed: boolean }>;
	get(ownerId: AccountId, id: string): Promise<AssetRecord>;
	list(ownerId: AccountId, projectId?: string): Promise<readonly AssetRecord[]>;
	open(ownerId: AccountId, id: string): Promise<SignedGetObject>;
	delete(ownerId: AccountId, id: string): Promise<void>;
}

export interface AssetIngestionDependencies {
	readonly assets: AssetRepositoryPort;
	readonly storage: ObjectStoragePort;
	readonly policy?: AssetIngestionPolicy;
	readonly now?: () => Date;
	readonly createId?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new AssetIngestionError("invalid-metadata", `${label} is required`);
	}
	return value.trim();
}

function parseIdempotencyKey(value: unknown): string {
	const key = requiredString(value, "Idempotency key");
	if (key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
		throw new AssetIngestionError(
			"invalid-metadata",
			"Idempotency key must contain at most 128 safe ASCII characters",
		);
	}
	return key;
}

function positiveInteger(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw new AssetIngestionError("invalid-metadata", `${label} must be a positive integer`);
	}
	return value;
}

function assertExactKeys(input: Record<string, unknown>, allowedKeys: readonly string[]): void {
	const allowed = new Set(allowedKeys);
	const unexpected = Object.keys(input).find((key) => !allowed.has(key));
	if (unexpected) {
		throw new AssetIngestionError(
			"invalid-metadata",
			`Unexpected asset metadata field '${unexpected}'`,
		);
	}
}

function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
			return true;
		}
	}
	return false;
}

function parseMetadata(input: unknown, policy: AssetIngestionPolicy): AssetMetadata {
	if (!isRecord(input)) {
		throw new AssetIngestionError("invalid-metadata", "Asset metadata must be an object");
	}
	if (input.kind !== "image" && input.kind !== "video" && input.kind !== "audio") {
		throw new AssetIngestionError("invalid-metadata", "Asset kind must be image, video or audio");
	}
	const kind = input.kind;
	const commonKeys = ["kind", "fileName", "mimeType", "byteSize", "checksum"];
	if (kind === "image") {
		assertExactKeys(input, [...commonKeys, "width", "height"]);
	} else if (kind === "video") {
		assertExactKeys(input, [...commonKeys, "width", "height", "durationMs"]);
	} else {
		assertExactKeys(input, [...commonKeys, "durationMs"]);
	}
	const fileName = requiredString(input.fileName, "Asset file name");
	if (
		fileName.length > 255 ||
		fileName.includes("/") ||
		fileName.includes("\\") ||
		hasControlCharacter(fileName)
	) {
		throw new AssetIngestionError("invalid-metadata", "Asset file name is invalid");
	}
	if (fileName.toLowerCase().endsWith(".svg")) {
		throw new AssetIngestionError("unsupported-media-type", "SVG assets are not supported");
	}
	const mimeType = requiredString(input.mimeType, "Asset MIME type").toLowerCase();
	const byteSize = positiveInteger(input.byteSize, "Asset byte size");
	const checksum = requiredString(input.checksum, "Asset checksum");
	if (!/^[0-9a-f]{64}$/.test(checksum)) {
		throw new AssetIngestionError(
			"invalid-metadata",
			"Asset checksum must be a lowercase SHA-256 hex digest",
		);
	}

	if (!policy.allowedMimeTypes[kind].includes(mimeType)) {
		throw new AssetIngestionError(
			"unsupported-media-type",
			`MIME type '${mimeType}' is not supported for ${kind} assets`,
		);
	}
	if (byteSize > policy.maxBytesByKind[kind]) {
		throw new AssetIngestionError("asset-too-large", `${kind} asset exceeds the upload limit`, {
			maxBytes: policy.maxBytesByKind[kind],
		});
	}

	if (kind === "image") {
		return {
			kind,
			fileName,
			mimeType,
			byteSize,
			checksum,
			width: positiveInteger(input.width, "Image width"),
			height: positiveInteger(input.height, "Image height"),
		};
	}
	if (kind === "video") {
		return {
			kind,
			fileName,
			mimeType,
			byteSize,
			checksum,
			width: positiveInteger(input.width, "Video width"),
			height: positiveInteger(input.height, "Video height"),
			durationMs: positiveInteger(input.durationMs, "Video duration"),
		};
	}
	return {
		kind,
		fileName,
		mimeType,
		byteSize,
		checksum,
		durationMs: positiveInteger(input.durationMs, "Audio duration"),
	};
}

function createObjectKey(ownerId: AccountId, projectId: string, id: string): string {
	return [
		"accounts",
		encodeURIComponent(ownerId),
		"projects",
		encodeURIComponent(projectId),
		"assets",
		encodeURIComponent(id),
	].join("/");
}

function finalizationFailureError(failureCode: AssetFailureCode | null): AssetIngestionError {
	if (failureCode === "object-missing") {
		return new AssetIngestionError("upload-missing", "Uploaded object was not found");
	}
	if (failureCode) {
		return new AssetIngestionError(
			"upload-integrity-failed",
			"Uploaded object does not match the reserved metadata",
			{ failureCode },
		);
	}
	return new AssetIngestionError("invalid-state", "Only a pending asset can be finalized");
}

/** Exported so the local render route sniffs media by the same rule as hosted ingestion. */
export function detectedMimeMatchesClaim(detected: string | null, claimed: string): boolean {
	if (detected === claimed) {
		return true;
	}
	const aliases: Readonly<Record<string, readonly string[]>> = {
		"audio/wav": ["audio/x-wav", "audio/vnd.wave"],
		"audio/x-wav": ["audio/wav", "audio/vnd.wave"],
		"audio/webm": ["video/webm"],
		"audio/mp4": ["video/mp4", "audio/x-m4a"],
	};
	return detected !== null && (aliases[claimed]?.includes(detected) ?? false);
}

export function createAssetIngestionService({
	assets,
	storage,
	policy = DEFAULT_ASSET_INGESTION_POLICY,
	now = () => new Date(),
	createId = () => `asset_${crypto.randomUUID()}`,
}: AssetIngestionDependencies): AssetIngestionService {
	async function persistFinalizationFailure(
		ownerId: AccountId,
		id: string,
		idempotencyKey: string,
		failureCode: AssetFailureCode,
	): Promise<never> {
		const result = await assets.markFailed({
			ownerId,
			id,
			idempotencyKey,
			failureCode,
			now: now(),
		});
		if (result.outcome === "not-found") {
			throw new AssetIngestionError("not-found", "Asset not found");
		}
		if (result.outcome === "idempotency-conflict") {
			throw new AssetIngestionError(
				"idempotency-conflict",
				"Asset was finalized with another idempotency key",
			);
		}
		if (result.outcome === "invalid-state") {
			throw new AssetIngestionError("invalid-state", "Only a pending asset can be finalized", {
				status: result.status,
			});
		}
		throw finalizationFailureError(result.asset.failureCode);
	}

	return {
		async reserve(input) {
			const projectId = requiredString(input.projectId, "Project id");
			const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
			const metadata = parseMetadata(input.metadata, policy);
			const id = createId();
			const pending = await assets.reservePending({
				id,
				ownerId: input.ownerId,
				projectId,
				objectKey: createObjectKey(input.ownerId, projectId, id),
				metadata,
				idempotencyKey,
				maxOwnerStorageBytes: Math.min(
					input.maxOwnerStorageBytes ?? policy.maxOwnerStorageBytes,
					policy.maxOwnerStorageBytes,
				),
				now: now(),
			});

			if (pending.outcome === "not-found") {
				throw new AssetIngestionError("not-found", "Project not found");
			}
			if (pending.outcome === "quota-exceeded") {
				throw new AssetIngestionError("quota-exceeded", "Asset storage quota exceeded", {
					usedBytes: pending.usedBytes,
					limitBytes: pending.limitBytes,
				});
			}
			if (pending.outcome === "idempotency-conflict") {
				throw new AssetIngestionError(
					"idempotency-conflict",
					"Idempotency key was already used with different asset metadata",
				);
			}

			const asset = pending.asset;
			const upload = await storage.signPut({
				objectKey: asset.objectKey,
				contentType: asset.metadata.mimeType,
				byteSize: asset.metadata.byteSize,
				checksumSha256: asset.metadata.checksum,
				expiresInSeconds: policy.uploadUrlTtlSeconds,
			});
			return { asset, upload, replayed: pending.outcome === "replayed" };
		},

		async finalize(input) {
			const id = requiredString(input.id, "Asset id");
			const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
			const asset = await assets.findOwnedById(input.ownerId, id);
			if (!asset) {
				throw new AssetIngestionError("not-found", "Asset not found");
			}

			if (asset.status === "ready") {
				if (asset.finalizeIdempotencyKey !== idempotencyKey) {
					throw new AssetIngestionError(
						"idempotency-conflict",
						"Asset was finalized with another idempotency key",
					);
				}
				return { asset, replayed: true };
			}
			if (asset.status === "failed") {
				if (asset.finalizeIdempotencyKey !== idempotencyKey) {
					throw new AssetIngestionError(
						"idempotency-conflict",
						"Asset was finalized with another idempotency key",
					);
				}
				throw finalizationFailureError(asset.failureCode);
			}
			if (asset.status !== "pending") {
				throw new AssetIngestionError("invalid-state", "Only a pending asset can be finalized");
			}

			const head = await storage.verifyObject(asset.objectKey, asset.metadata.byteSize);
			if (!head) {
				return persistFinalizationFailure(input.ownerId, id, idempotencyKey, "object-missing");
			}

			let failureCode: AssetFailureCode | null = null;
			if (head.contentType !== asset.metadata.mimeType) {
				failureCode = "content-type-mismatch";
			} else if (head.byteSize !== asset.metadata.byteSize) {
				failureCode = "size-mismatch";
			} else if (head.checksumSha256 === null || head.checksumSha256 !== asset.metadata.checksum) {
				failureCode = "checksum-mismatch";
			} else if (!detectedMimeMatchesClaim(head.detectedMimeType, asset.metadata.mimeType)) {
				failureCode = "media-type-mismatch";
			}
			if (failureCode) {
				return persistFinalizationFailure(input.ownerId, id, idempotencyKey, failureCode);
			}
			const verifiedChecksum = head.checksumSha256;
			if (verifiedChecksum === null) {
				throw new Error("Verified asset checksum unexpectedly disappeared");
			}

			const finalized = await assets.finalizeReady({
				ownerId: input.ownerId,
				id,
				idempotencyKey,
				verifiedChecksum,
				now: now(),
			});
			if (finalized.outcome === "not-found") {
				throw new AssetIngestionError("not-found", "Asset not found");
			}
			if (finalized.outcome === "idempotency-conflict") {
				throw new AssetIngestionError(
					"idempotency-conflict",
					"Asset was finalized with another idempotency key",
				);
			}
			if (finalized.outcome === "invalid-state") {
				throw new AssetIngestionError("invalid-state", "Only a pending asset can be finalized", {
					status: finalized.status,
				});
			}
			return { asset: finalized.asset, replayed: finalized.replayed };
		},

		async get(ownerId, id) {
			const asset = await assets.findOwnedById(ownerId, requiredString(id, "Asset id"));
			if (!asset) {
				throw new AssetIngestionError("not-found", "Asset not found");
			}
			return asset;
		},

		async list(ownerId, projectId) {
			const scope = projectId === undefined ? undefined : requiredString(projectId, "Project id");
			return assets.listByOwner(ownerId, scope);
		},

		async open(ownerId, id) {
			const asset = await assets.findOwnedById(ownerId, requiredString(id, "Asset id"));
			if (!asset) {
				throw new AssetIngestionError("not-found", "Asset not found");
			}
			if (asset.status !== "ready") {
				throw new AssetIngestionError("invalid-state", "Only a ready asset can be opened", {
					status: asset.status,
				});
			}
			return storage.signGet({
				objectKey: asset.objectKey,
				expiresInSeconds: policy.readUrlTtlSeconds,
			});
		},

		async delete(ownerId, id) {
			const result = await assets.deleteOwnedIfUnreferenced(
				ownerId,
				requiredString(id, "Asset id"),
			);
			if (result.outcome === "not-found") {
				throw new AssetIngestionError("not-found", "Asset not found");
			}
			if (result.outcome === "referenced") {
				throw new AssetIngestionError(
					"asset-referenced",
					"Asset is referenced by a project and cannot be deleted",
				);
			}
		},
	};
}
