import { describe, expect, it } from "vitest";
import {
	type AssetIngestionPolicy,
	createAssetIngestionService,
} from "../../src/application/assets/asset-ingestion";
import type {
	AssetRecord,
	AssetRepositoryPort,
	DeleteOwnedAssetResult,
	FinalizeAssetResult,
	MarkAssetFailedResult,
	ReservePendingAssetResult,
} from "../../src/application/assets/asset-repository.port";
import type {
	ObjectStoragePort,
	SignedGetObject,
	SignedPutUpload,
	StoredObjectHead,
} from "../../src/application/assets/object-storage.port";

const NOW = new Date("2026-08-30T20:00:00.000Z");
const CHECKSUM = "a".repeat(64);
const POLICY: AssetIngestionPolicy = {
	allowedMimeTypes: {
		image: ["image/png"],
		video: ["video/mp4"],
		audio: ["audio/mpeg"],
	},
	maxBytesByKind: {
		image: 1_000_000,
		video: 10_000_000,
		audio: 2_000_000,
	},
	maxOwnerStorageBytes: 20_000_000,
	uploadUrlTtlSeconds: 600,
	readUrlTtlSeconds: 300,
};

class MemoryAssets implements AssetRepositoryPort {
	readonly records = new Map<string, AssetRecord>();
	readonly referencedIds = new Set<string>();
	reserveOverride: ReservePendingAssetResult | null = null;
	lastReserveInput: Parameters<AssetRepositoryPort["reservePending"]>[0] | null = null;

	async reservePending(
		input: Parameters<AssetRepositoryPort["reservePending"]>[0],
	): Promise<ReservePendingAssetResult> {
		this.lastReserveInput = input;
		if (this.reserveOverride) {
			return this.reserveOverride;
		}
		const asset: AssetRecord = {
			id: input.id,
			ownerId: input.ownerId,
			projectId: input.projectId,
			objectKey: input.objectKey,
			metadata: input.metadata,
			status: "pending",
			reserveIdempotencyKey: input.idempotencyKey,
			finalizeIdempotencyKey: null,
			verifiedChecksum: null,
			failureCode: null,
			createdAt: input.now,
			updatedAt: input.now,
			readyAt: null,
		};
		this.records.set(asset.id, asset);
		return { outcome: "created", asset };
	}

	async findOwnedById(ownerId: string, id: string): Promise<AssetRecord | null> {
		const asset = this.records.get(id);
		return asset?.ownerId === ownerId ? asset : null;
	}

	async listByOwner(ownerId: string, projectId?: string): Promise<readonly AssetRecord[]> {
		return [...this.records.values()].filter(
			(asset) => asset.ownerId === ownerId && (!projectId || asset.projectId === projectId),
		);
	}

	async finalizeReady(
		input: Parameters<AssetRepositoryPort["finalizeReady"]>[0],
	): Promise<FinalizeAssetResult> {
		const current = await this.findOwnedById(input.ownerId, input.id);
		if (!current) {
			return { outcome: "not-found" };
		}
		if (current.status === "ready") {
			if (current.finalizeIdempotencyKey !== input.idempotencyKey) {
				return { outcome: "idempotency-conflict" };
			}
			return { outcome: "ready", asset: current, replayed: true };
		}
		if (current.status !== "pending") {
			return { outcome: "invalid-state", status: current.status };
		}
		const asset: AssetRecord = {
			...current,
			status: "ready",
			finalizeIdempotencyKey: input.idempotencyKey,
			verifiedChecksum: input.verifiedChecksum,
			updatedAt: input.now,
			readyAt: input.now,
		};
		this.records.set(asset.id, asset);
		return { outcome: "ready", asset, replayed: false };
	}

	async markFailed(
		input: Parameters<AssetRepositoryPort["markFailed"]>[0],
	): Promise<MarkAssetFailedResult> {
		const current = await this.findOwnedById(input.ownerId, input.id);
		if (!current) {
			return { outcome: "not-found" };
		}
		if (current.status === "failed") {
			if (current.finalizeIdempotencyKey !== input.idempotencyKey) {
				return { outcome: "idempotency-conflict" };
			}
			return { outcome: "failed", asset: current, replayed: true };
		}
		if (current.status !== "pending") {
			return { outcome: "invalid-state", status: current.status };
		}
		const asset: AssetRecord = {
			...current,
			status: "failed",
			finalizeIdempotencyKey: input.idempotencyKey,
			failureCode: input.failureCode,
			updatedAt: input.now,
		};
		this.records.set(current.id, asset);
		return { outcome: "failed", asset, replayed: false };
	}

	async deleteOwnedIfUnreferenced(ownerId: string, id: string): Promise<DeleteOwnedAssetResult> {
		const current = await this.findOwnedById(ownerId, id);
		if (!current) {
			return { outcome: "not-found" };
		}
		if (this.referencedIds.has(id)) {
			return { outcome: "referenced" };
		}
		this.records.delete(id);
		return { outcome: "deleted" };
	}
}

class MemoryStorage implements ObjectStoragePort {
	readonly signRequests: Parameters<ObjectStoragePort["signPut"]>[0][] = [];
	readonly readRequests: Parameters<ObjectStoragePort["signGet"]>[0][] = [];
	readonly heads = new Map<string, StoredObjectHead>();
	readonly verifyRequests: { objectKey: string; maxByteSize: number }[] = [];
	readonly deleteRequests: string[] = [];

	async signPut(input: Parameters<ObjectStoragePort["signPut"]>[0]): Promise<SignedPutUpload> {
		this.signRequests.push(input);
		return {
			method: "PUT",
			url: "https://objects.example.test/signed-put",
			headers: {
				"content-type": input.contentType,
				"x-checksum-sha256": input.checksumSha256,
			},
			checksum: { algorithm: "sha256", value: input.checksumSha256 },
			expiresAt: new Date(NOW.getTime() + input.expiresInSeconds * 1_000),
		};
	}

	async signGet(input: Parameters<ObjectStoragePort["signGet"]>[0]): Promise<SignedGetObject> {
		this.readRequests.push(input);
		return {
			method: "GET",
			url: "https://objects.example.test/signed-get",
			expiresAt: new Date(NOW.getTime() + input.expiresInSeconds * 1_000),
		};
	}

	async verifyObject(objectKey: string, maxByteSize: number): Promise<StoredObjectHead | null> {
		this.verifyRequests.push({ objectKey, maxByteSize });
		return this.heads.get(objectKey) ?? null;
	}

	async deleteObject(objectKey: string): Promise<void> {
		this.deleteRequests.push(objectKey);
	}
}

describe("asset ingestion", () => {
	it("reserves metadata only and returns a constrained signed PUT upload", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-1",
		});

		const result = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-1",
			metadata: {
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		});

		expect(result).toMatchObject({
			replayed: false,
			asset: { id: "asset-1", ownerId: "account-1", status: "pending" },
			upload: {
				method: "PUT",
				url: "https://objects.example.test/signed-put",
				checksum: { algorithm: "sha256", value: CHECKSUM },
			},
		});
		expect(storage.signRequests).toEqual([
			{
				objectKey: "accounts/account-1/projects/project-1/assets/asset-1",
				contentType: "image/png",
				byteSize: 42_000,
				checksumSha256: CHECKSUM,
				expiresInSeconds: 600,
			},
		]);
		expect("bytes" in result.asset.metadata).toBe(false);
	});

	it("rejects extra metadata fields so media bytes cannot enter the API contract", async () => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
		});

		await expect(
			service.reserve({
				ownerId: "account-1",
				projectId: "project-1",
				idempotencyKey: "reserve-extra-field",
				metadata: {
					kind: "image",
					fileName: "hero.png",
					mimeType: "image/png",
					byteSize: 42_000,
					checksum: CHECKSUM,
					width: 1600,
					height: 900,
					bytes: "not-allowed",
				},
			}),
		).rejects.toMatchObject({ code: "invalid-metadata" });
		expect(assets.records.size).toBe(0);
	});

	it("requires a canonical SHA-256 checksum before reserving storage", async () => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
		});

		await expect(
			service.reserve({
				ownerId: "account-1",
				projectId: "project-1",
				idempotencyKey: "reserve-bad-checksum",
				metadata: {
					kind: "audio",
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					byteSize: 42_000,
					checksum: "sha256:claimed-by-client",
					durationMs: 2_000,
				},
			}),
		).rejects.toMatchObject({ code: "invalid-metadata" });
		expect(assets.records.size).toBe(0);
	});

	it("rejects unsafe or unbounded idempotency keys", async () => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
		});

		await expect(
			service.reserve({
				ownerId: "account-1",
				projectId: "project-1",
				idempotencyKey: "x".repeat(129),
				metadata: {
					kind: "image",
					fileName: "hero.png",
					mimeType: "image/png",
					byteSize: 42_000,
					checksum: CHECKSUM,
					width: 1600,
					height: 900,
				},
			}),
		).rejects.toMatchObject({ code: "invalid-metadata" });
		expect(assets.records.size).toBe(0);
	});

	it("rejects SVG filenames even when the claimed MIME type is allowed", async () => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
		});

		await expect(
			service.reserve({
				ownerId: "account-1",
				projectId: "project-1",
				idempotencyKey: "reserve-svg",
				metadata: {
					kind: "image",
					fileName: "active-content.svg",
					mimeType: "image/png",
					byteSize: 42_000,
					checksum: CHECKSUM,
					width: 1600,
					height: 900,
				},
			}),
		).rejects.toMatchObject({ code: "unsupported-media-type" });
		expect(assets.records.size).toBe(0);
	});

	it.each([
		{
			label: "an unsupported MIME type",
			metadata: {
				kind: "image",
				fileName: "hero.bmp",
				mimeType: "image/bmp",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
			code: "unsupported-media-type",
		},
		{
			label: "a per-kind size overflow",
			metadata: {
				kind: "audio",
				fileName: "voice.mp3",
				mimeType: "audio/mpeg",
				byteSize: 2_000_001,
				checksum: CHECKSUM,
				durationMs: 2_000,
			},
			code: "asset-too-large",
		},
	])("rejects $label before persistence", async ({ metadata, code }) => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
		});

		await expect(
			service.reserve({
				ownerId: "account-1",
				projectId: "project-1",
				idempotencyKey: "reserve-policy-check",
				metadata,
			}),
		).rejects.toMatchObject({ code });
		expect(assets.records.size).toBe(0);
	});

	it("replays the original reservation for the same idempotency key", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-original",
		});
		const request = {
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-repeat",
			metadata: {
				kind: "image" as const,
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		};
		const first = await service.reserve(request);
		assets.reserveOverride = { outcome: "replayed", asset: first.asset };

		const repeated = await service.reserve(request);

		expect(repeated).toMatchObject({
			replayed: true,
			asset: { id: "asset-original" },
			upload: { method: "PUT" },
		});
		expect(storage.signRequests).toHaveLength(2);
	});

	it("maps an atomic owner quota rejection without signing an upload", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		assets.reserveOverride = {
			outcome: "quota-exceeded",
			usedBytes: 19_990_000,
			limitBytes: 20_000_000,
		};
		const service = createAssetIngestionService({ assets, storage, policy: POLICY });

		await expect(
			service.reserve({
				ownerId: "account-1",
				projectId: "project-1",
				idempotencyKey: "reserve-over-quota",
				metadata: {
					kind: "audio",
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					byteSize: 42_000,
					checksum: CHECKSUM,
					durationMs: 2_000,
				},
			}),
		).rejects.toMatchObject({
			code: "quota-exceeded",
			details: { usedBytes: 19_990_000, limitBytes: 20_000_000 },
		});
		expect(storage.signRequests).toHaveLength(0);
		expect(assets.lastReserveInput?.maxOwnerStorageBytes).toBe(20_000_000);
	});

	it("conceals a foreign project as not found before signing an upload", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		assets.reserveOverride = { outcome: "not-found" };
		const service = createAssetIngestionService({ assets, storage, policy: POLICY });

		await expect(
			service.reserve({
				ownerId: "account-2",
				projectId: "project-owned-by-account-1",
				idempotencyKey: "reserve-foreign",
				metadata: {
					kind: "video",
					fileName: "demo.mp4",
					mimeType: "video/mp4",
					byteSize: 42_000,
					checksum: CHECKSUM,
					width: 1920,
					height: 1080,
					durationMs: 2_000,
				},
			}),
		).rejects.toMatchObject({ code: "not-found" });
		expect(storage.signRequests).toHaveLength(0);
	});

	it("finalizes only after object storage independently confirms checksum, MIME and size", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-finalize",
		});
		const reserved = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-finalize",
			metadata: {
				kind: "video",
				fileName: "demo.mp4",
				mimeType: "video/mp4",
				byteSize: 420_000,
				checksum: CHECKSUM,
				width: 1920,
				height: 1080,
				durationMs: 2_000,
			},
		});
		storage.heads.set(reserved.asset.objectKey, {
			contentType: "video/mp4",
			byteSize: 420_000,
			checksumSha256: CHECKSUM,
			detectedMimeType: "video/mp4",
		});

		const result = await service.finalize({
			ownerId: "account-1",
			id: "asset-finalize",
			idempotencyKey: "finalize-1",
		});

		expect(result).toMatchObject({
			replayed: false,
			asset: {
				id: "asset-finalize",
				status: "ready",
				verifiedChecksum: CHECKSUM,
				finalizeIdempotencyKey: "finalize-1",
				readyAt: NOW,
			},
		});
	});

	it.each([
		{
			label: "checksum",
			head: {
				contentType: "video/mp4",
				byteSize: 420_000,
				checksumSha256: "b".repeat(64),
				detectedMimeType: "video/mp4",
			},
			failureCode: "checksum-mismatch",
		},
		{
			label: "content type",
			head: {
				contentType: "video/webm",
				byteSize: 420_000,
				checksumSha256: CHECKSUM,
				detectedMimeType: "video/mp4",
			},
			failureCode: "content-type-mismatch",
		},
		{
			label: "byte size",
			head: {
				contentType: "video/mp4",
				byteSize: 419_999,
				checksumSha256: CHECKSUM,
				detectedMimeType: "video/mp4",
			},
			failureCode: "size-mismatch",
		},
	])("rejects a storage-side $label mismatch", async ({ head, failureCode }) => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-mismatch",
		});
		const reserved = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-mismatch",
			metadata: {
				kind: "video",
				fileName: "demo.mp4",
				mimeType: "video/mp4",
				byteSize: 420_000,
				checksum: CHECKSUM,
				width: 1920,
				height: 1080,
				durationMs: 2_000,
			},
		});
		storage.heads.set(reserved.asset.objectKey, head);

		await expect(
			service.finalize({
				ownerId: "account-1",
				id: reserved.asset.id,
				idempotencyKey: "finalize-mismatch",
			}),
		).rejects.toMatchObject({
			code: "upload-integrity-failed",
			details: { failureCode },
		});
		expect(assets.records.get(reserved.asset.id)).toMatchObject({
			status: "failed",
			failureCode,
			readyAt: null,
		});
	});

	it("rejects bytes whose detected media type disagrees with the signed claim", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-disguised",
		});
		const reserved = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-disguised",
			metadata: {
				kind: "image",
				fileName: "not-really-an-image.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		});
		storage.heads.set(reserved.asset.objectKey, {
			contentType: "image/png",
			byteSize: 42_000,
			checksumSha256: CHECKSUM,
			detectedMimeType: "application/pdf",
		});

		await expect(
			service.finalize({
				ownerId: "account-1",
				id: reserved.asset.id,
				idempotencyKey: "finalize-disguised",
			}),
		).rejects.toMatchObject({
			code: "upload-integrity-failed",
			details: { failureCode: "media-type-mismatch" },
		});
	});

	it("fails finalization when the direct upload is missing", async () => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-missing-upload",
		});
		await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-missing-upload",
			metadata: {
				kind: "audio",
				fileName: "voice.mp3",
				mimeType: "audio/mpeg",
				byteSize: 42_000,
				checksum: CHECKSUM,
				durationMs: 2_000,
			},
		});

		await expect(
			service.finalize({
				ownerId: "account-1",
				id: "asset-missing-upload",
				idempotencyKey: "finalize-missing-upload",
			}),
		).rejects.toMatchObject({ code: "upload-missing" });
		expect(assets.records.get("asset-missing-upload")).toMatchObject({
			status: "failed",
			failureCode: "object-missing",
		});
	});

	it("replays a failed finalization with the same key and the same observable error", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-failed-replay",
		});
		await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-failed-replay",
			metadata: {
				kind: "audio",
				fileName: "voice.mp3",
				mimeType: "audio/mpeg",
				byteSize: 42_000,
				checksum: CHECKSUM,
				durationMs: 2_000,
			},
		});
		const finalize = () =>
			service.finalize({
				ownerId: "account-1",
				id: "asset-failed-replay",
				idempotencyKey: "finalize-failed-replay",
			});

		await expect(finalize()).rejects.toMatchObject({ code: "upload-missing" });
		await expect(finalize()).rejects.toMatchObject({ code: "upload-missing" });
		expect(storage.verifyRequests).toHaveLength(1);
		expect(assets.records.get("asset-failed-replay")).toMatchObject({
			finalizeIdempotencyKey: "finalize-failed-replay",
		});
	});

	it("replays finalization with the same key without trusting or reading storage again", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-finalize-replay",
		});
		const reserved = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-finalize-replay",
			metadata: {
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		});
		storage.heads.set(reserved.asset.objectKey, {
			contentType: "image/png",
			byteSize: 42_000,
			checksumSha256: CHECKSUM,
			detectedMimeType: "image/png",
		});
		await service.finalize({
			ownerId: "account-1",
			id: reserved.asset.id,
			idempotencyKey: "finalize-replay",
		});

		const repeated = await service.finalize({
			ownerId: "account-1",
			id: reserved.asset.id,
			idempotencyKey: "finalize-replay",
		});

		expect(repeated).toMatchObject({ replayed: true, asset: { status: "ready" } });
		expect(storage.verifyRequests).toEqual([
			{ objectKey: reserved.asset.objectKey, maxByteSize: reserved.asset.metadata.byteSize },
		]);
	});

	it("conceals foreign asset ids during finalization before object storage is queried", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			createId: () => "asset-private",
		});
		await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-private",
			metadata: {
				kind: "audio",
				fileName: "voice.mp3",
				mimeType: "audio/mpeg",
				byteSize: 42_000,
				checksum: CHECKSUM,
				durationMs: 2_000,
			},
		});

		await expect(
			service.finalize({
				ownerId: "account-2",
				id: "asset-private",
				idempotencyKey: "finalize-foreign",
			}),
		).rejects.toMatchObject({ code: "not-found" });
		expect(storage.verifyRequests).toHaveLength(0);
	});

	it("gets and lists assets only through owner-scoped repository operations", async () => {
		const assets = new MemoryAssets();
		const service = createAssetIngestionService({
			assets,
			storage: new MemoryStorage(),
			policy: POLICY,
			createId: () => "asset-owned",
		});
		await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-owned",
			metadata: {
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		});

		await expect(service.get("account-2", "asset-owned")).rejects.toMatchObject({
			code: "not-found",
		});
		await expect(service.list("account-2")).resolves.toEqual([]);
		await expect(service.list("account-1", "project-1")).resolves.toMatchObject([
			{ id: "asset-owned", ownerId: "account-1" },
		]);
	});

	it("opens only ready owner-scoped assets through a short-lived private GET", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			now: () => NOW,
			createId: () => "asset-readable",
		});
		const reserved = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-readable",
			metadata: {
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		});

		await expect(service.open("account-1", reserved.asset.id)).rejects.toMatchObject({
			code: "invalid-state",
		});
		expect(storage.readRequests).toHaveLength(0);

		assets.records.set(reserved.asset.id, {
			...reserved.asset,
			status: "ready",
			verifiedChecksum: CHECKSUM,
			readyAt: NOW,
		});
		await expect(service.open("account-2", reserved.asset.id)).rejects.toMatchObject({
			code: "not-found",
		});
		await expect(service.open("account-1", reserved.asset.id)).resolves.toEqual({
			method: "GET",
			url: "https://objects.example.test/signed-get",
			expiresAt: new Date(NOW.getTime() + 300_000),
		});
		expect(storage.readRequests).toEqual([
			{
				objectKey: reserved.asset.objectKey,
				expiresInSeconds: 300,
			},
		]);
	});

	it("refuses to delete an asset referenced by a project", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			createId: () => "asset-referenced",
		});
		await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-referenced",
			metadata: {
				kind: "image",
				fileName: "hero.png",
				mimeType: "image/png",
				byteSize: 42_000,
				checksum: CHECKSUM,
				width: 1600,
				height: 900,
			},
		});
		assets.referencedIds.add("asset-referenced");

		await expect(service.delete("account-1", "asset-referenced")).rejects.toMatchObject({
			code: "asset-referenced",
		});
		expect(assets.records.has("asset-referenced")).toBe(true);
		expect(storage.deleteRequests).toHaveLength(0);
	});

	it("durably schedules owner-scoped object deletion without waiting for storage", async () => {
		const assets = new MemoryAssets();
		const storage = new MemoryStorage();
		const service = createAssetIngestionService({
			assets,
			storage,
			policy: POLICY,
			createId: () => "asset-delete",
		});
		const reserved = await service.reserve({
			ownerId: "account-1",
			projectId: "project-1",
			idempotencyKey: "reserve-delete",
			metadata: {
				kind: "audio",
				fileName: "voice.mp3",
				mimeType: "audio/mpeg",
				byteSize: 42_000,
				checksum: CHECKSUM,
				durationMs: 2_000,
			},
		});

		await expect(service.delete("account-2", "asset-delete")).rejects.toMatchObject({
			code: "not-found",
		});
		expect(storage.deleteRequests).toHaveLength(0);

		await service.delete("account-1", "asset-delete");

		expect(assets.records.has("asset-delete")).toBe(false);
		expect(reserved.asset.objectKey).toContain("asset-delete");
		expect(storage.deleteRequests).toEqual([]);
	});
});
