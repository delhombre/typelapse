import { Hono } from "hono";
import { Plan } from "../../src/domain/value-objects/plan";
import { describe, expect, it } from "vitest";
import { createAssetsRoute } from "../../server/routes/assets";
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
import type { AuthPort } from "../../src/domain/ports/auth.port";

const NOW = new Date("2026-08-30T20:00:00.000Z");
const CHECKSUM = "a".repeat(64);

class RouteAssetsFake implements AssetRepositoryPort {
	readonly records = new Map<string, AssetRecord>();
	readonly referencedIds = new Set<string>();
	usedBytes = 0;
	lastLimitBytes = 0;

	async reservePending(
		input: Parameters<AssetRepositoryPort["reservePending"]>[0],
	): Promise<ReservePendingAssetResult> {
		this.lastLimitBytes = input.maxOwnerStorageBytes;
		if (this.usedBytes + input.metadata.byteSize > input.maxOwnerStorageBytes) {
			return {
				outcome: "quota-exceeded",
				usedBytes: this.usedBytes,
				limitBytes: input.maxOwnerStorageBytes,
			};
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

	async deleteOwnedIfUnreferenced(
		ownerId: string,
		id: string,
	): Promise<DeleteOwnedAssetResult> {
		const asset = await this.findOwnedById(ownerId, id);
		if (!asset) {
			return { outcome: "not-found" };
		}
		if (this.referencedIds.has(id)) {
			return { outcome: "referenced" };
		}
		this.records.delete(id);
		return { outcome: "deleted" };
	}
}

class RouteStorageFake implements ObjectStoragePort {
	readonly heads = new Map<string, StoredObjectHead>();
	readonly deleted: string[] = [];
	readonly readKeys: string[] = [];

	async signPut(
		input: Parameters<ObjectStoragePort["signPut"]>[0],
	): Promise<SignedPutUpload> {
		return {
			method: "PUT",
			url: "https://objects.example.test/upload",
			headers: {
				"content-type": input.contentType,
				"x-checksum-sha256": input.checksumSha256,
			},
			checksum: { algorithm: "sha256", value: input.checksumSha256 },
			expiresAt: new Date(NOW.getTime() + 600_000),
		};
	}

	async signGet(
		input: Parameters<ObjectStoragePort["signGet"]>[0],
	): Promise<SignedGetObject> {
		this.readKeys.push(input.objectKey);
		return {
			method: "GET",
			url: "https://objects.example.test/private-read",
			expiresAt: new Date(NOW.getTime() + input.expiresInSeconds * 1_000),
		};
	}

	async verifyObject(objectKey: string, _maxByteSize: number): Promise<StoredObjectHead | null> {
		return this.heads.get(objectKey) ?? null;
	}

	async deleteObject(objectKey: string): Promise<void> {
		this.deleted.push(objectKey);
	}
}

function signedInAs(accountId: string): AuthPort {
	return {
		verify: async () => ({ accountId, expiresAt: new Date(NOW.getTime() + 60_000) }),
	};
}

function appFor(
	assets: RouteAssetsFake,
	storage: RouteStorageFake,
	auth: AuthPort = signedInAs("account-1"),
	plan: Plan = Plan.free(),
) {
	return new Hono().route(
		"/api/assets",
		createAssetsRoute({
			auth,
			assets,
			storage,
			subscriptions: { planFor: async () => plan },
			now: () => NOW,
			createId: () => "asset-route-1",
		}),
	);
}

function request(path: string, init?: RequestInit): Request {
	const headers = new Headers(init?.headers);
	headers.set("cookie", "session=valid");
	if (init?.body) {
		headers.set("content-type", "application/json");
	}
	return new Request("http://localhost" + path, { ...init, headers });
}

const IMAGE_METADATA = {
	kind: "image",
	fileName: "hero.png",
	mimeType: "image/png",
	byteSize: 42_000,
	checksum: CHECKSUM,
	width: 1600,
	height: 900,
};

describe("assets route", () => {
	it("requires an active account session on every endpoint", async () => {
		const app = appFor(new RouteAssetsFake(), new RouteStorageFake(), {
			verify: async () => null,
		});

		const response = await app.request("http://localhost/api/assets");

		expect(response.status).toBe(401);
	});

	it("reserves an owner-scoped pending asset and returns only a signed PUT contract", async () => {
		const assets = new RouteAssetsFake();
		const app = appFor(assets, new RouteStorageFake());

		const response = await app.request(
			request("/api/assets/reserve", {
				method: "POST",
				headers: { "idempotency-key": "reserve-route-1" },
				body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body).toMatchObject({
			replayed: false,
			asset: {
				id: "asset-route-1",
				projectId: "project-1",
				status: "pending",
			},
			upload: {
				method: "PUT",
				url: "https://objects.example.test/upload",
				checksum: { algorithm: "sha256", value: CHECKSUM },
			},
		});
		expect(body.upload.headers).toEqual({
			"content-type": "image/png",
			"x-checksum-sha256": CHECKSUM,
		});
		expect("bytes" in body.asset.metadata).toBe(false);
		expect(body.asset).not.toHaveProperty("objectKey");
		expect(body.asset).not.toHaveProperty("ownerId");
		expect(body.asset).not.toHaveProperty("reserveIdempotencyKey");
	});

	it("stores up to the plan's media allowance and names the ceiling past it", async () => {
		const MB = 1024 * 1024;
		const assets = new RouteAssetsFake();
		assets.usedBytes = 100 * MB - 1000;
		const reserve = (plan: Plan) =>
			appFor(assets, new RouteStorageFake(), signedInAs("account-1"), plan).request(
				request("/api/assets/reserve", {
					method: "POST",
					headers: { "idempotency-key": "reserve-quota-1" },
					body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
				}),
			);

		const free = await reserve(Plan.free());
		expect(free.status).toBe(413);
		expect(await free.json()).toEqual({
			error: "Free stores 100\u00a0MB of media; Creator stores 5\u00a0GB",
			code: "plan-limit",
			ceiling: "mediaBytes",
			limit: 100 * MB,
			used: 100 * MB - 1000,
			plan: "free",
			upgradeTo: "creator",
			usedBytes: 100 * MB - 1000,
			limitBytes: 100 * MB,
		});

		const creator = await reserve(Plan.pro());
		expect(creator.status).toBe(201);
		expect(assets.lastLimitBytes).toBe(5 * 1024 * MB);
	});

	it("requires an idempotency key before creating a pending record", async () => {
		const assets = new RouteAssetsFake();
		const app = appFor(assets, new RouteStorageFake());

		const response = await app.request(
			request("/api/assets/reserve", {
				method: "POST",
				body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Idempotency-Key header is required",
		});
		expect(assets.records.size).toBe(0);
	});

	it("rejects byte-bearing or otherwise non-strict metadata bodies", async () => {
		const assets = new RouteAssetsFake();
		const app = appFor(assets, new RouteStorageFake());

		const response = await app.request(
			request("/api/assets/reserve", {
				method: "POST",
				headers: { "idempotency-key": "reserve-with-bytes" },
				body: JSON.stringify({
					projectId: "project-1",
					metadata: { ...IMAGE_METADATA, bytes: "base64-is-not-an-api-contract" },
				}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.code).toBe("invalid-metadata");
		expect(assets.records.size).toBe(0);
	});

	it("finalizes through storage HEAD verification and requires its own idempotency key", async () => {
		const assets = new RouteAssetsFake();
		const storage = new RouteStorageFake();
		const app = appFor(assets, storage);
		await app.request(
			request("/api/assets/reserve", {
				method: "POST",
				headers: { "idempotency-key": "reserve-before-finalize" },
				body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
			}),
		);
		const asset = assets.records.get("asset-route-1");
		if (!asset) {
			throw new Error("Expected reserved asset");
		}
		storage.heads.set(asset.objectKey, {
			contentType: "image/png",
			byteSize: 42_000,
			checksumSha256: CHECKSUM,
			detectedMimeType: "image/png",
		});

		const missingKey = await app.request(
			request("/api/assets/asset-route-1/finalize", { method: "POST" }),
		);
		expect(missingKey.status).toBe(400);
		expect(assets.records.get("asset-route-1")?.status).toBe("pending");

		const response = await app.request(
			request("/api/assets/asset-route-1/finalize", {
				method: "POST",
				headers: { "idempotency-key": "finalize-route-1" },
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			replayed: false,
			asset: {
				id: "asset-route-1",
				status: "ready",
				verifiedChecksum: CHECKSUM,
			},
		});
	});

	it("returns 404 for foreign ids and lists only the authenticated owner's assets", async () => {
		const assets = new RouteAssetsFake();
		const storage = new RouteStorageFake();
		const ownerApp = appFor(assets, storage, signedInAs("account-1"));
		await ownerApp.request(
			request("/api/assets/reserve", {
				method: "POST",
				headers: { "idempotency-key": "reserve-private-route" },
				body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
			}),
		);
		const foreignApp = appFor(assets, storage, signedInAs("account-2"));

		const foreignGet = await foreignApp.request(
			request("/api/assets/asset-route-1"),
		);
		const foreignList = await foreignApp.request(request("/api/assets"));
		const ownerList = await ownerApp.request(
			request("/api/assets?projectId=project-1"),
		);

		expect(foreignGet.status).toBe(404);
		expect(foreignList.status).toBe(200);
		expect(await foreignList.json()).toEqual({ assets: [] });
		expect(ownerList.status).toBe(200);
		expect(await ownerList.json()).toMatchObject({
			assets: [{ id: "asset-route-1", projectId: "project-1" }],
		});
	});

	it("returns a no-store private read URL only for ready media owned by the session", async () => {
		const assets = new RouteAssetsFake();
		const storage = new RouteStorageFake();
		const ownerApp = appFor(assets, storage, signedInAs("account-1"));
		await ownerApp.request(
			request("/api/assets/reserve", {
				method: "POST",
				headers: { "idempotency-key": "reserve-private-read" },
				body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
			}),
		);

		const pending = await ownerApp.request(request("/api/assets/asset-route-1/content"));
		expect(pending.status).toBe(409);
		expect(storage.readKeys).toHaveLength(0);

		const current = assets.records.get("asset-route-1");
		if (!current) {
			throw new Error("Expected reserved asset");
		}
		assets.records.set(current.id, {
			...current,
			status: "ready",
			verifiedChecksum: CHECKSUM,
			readyAt: NOW,
		});
		const foreignApp = appFor(assets, storage, signedInAs("account-2"));
		const foreign = await foreignApp.request(
			request("/api/assets/asset-route-1/content"),
		);
		expect(foreign.status).toBe(404);
		expect(storage.readKeys).toHaveLength(0);

		const response = await ownerApp.request(
			request("/api/assets/asset-route-1/content"),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			access: {
				method: "GET",
				url: "https://objects.example.test/private-read",
				expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
			},
		});
		expect(storage.readKeys).toEqual([
			"accounts/account-1/projects/project-1/assets/asset-route-1",
		]);
	});

	it("refuses referenced deletes and keeps foreign deletes indistinguishable from missing ids", async () => {
		const assets = new RouteAssetsFake();
		const storage = new RouteStorageFake();
		const ownerApp = appFor(assets, storage, signedInAs("account-1"));
		await ownerApp.request(
			request("/api/assets/reserve", {
				method: "POST",
				headers: { "idempotency-key": "reserve-delete-route" },
				body: JSON.stringify({ projectId: "project-1", metadata: IMAGE_METADATA }),
			}),
		);
		assets.referencedIds.add("asset-route-1");

		const referenced = await ownerApp.request(
			request("/api/assets/asset-route-1", { method: "DELETE" }),
		);
		const foreignApp = appFor(assets, storage, signedInAs("account-2"));
		const foreign = await foreignApp.request(
			request("/api/assets/asset-route-1", { method: "DELETE" }),
		);

		expect(referenced.status).toBe(409);
		expect(await referenced.json()).toMatchObject({ code: "asset-referenced" });
		expect(foreign.status).toBe(404);
		expect(storage.deleted).toHaveLength(0);

		assets.referencedIds.delete("asset-route-1");
		const deleted = await ownerApp.request(
			request("/api/assets/asset-route-1", { method: "DELETE" }),
		);

		expect(deleted.status).toBe(204);
		expect(storage.deleted).toEqual([]);
	});
});
