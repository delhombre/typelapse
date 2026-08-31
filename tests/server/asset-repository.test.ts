import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	assetRecordFromRow,
	createAssetRepository,
	createHostedProjectAssetResolver,
} from "../../server/db/asset.repository";
import { assets } from "../../server/db/creator-schema";
import type { CreatorDatabase } from "../../server/db/database";

const NOW = new Date("2026-08-30T20:00:00.000Z");

function imageRow() {
	return {
		id: "asset-1",
		projectId: "project-1",
		kind: "image" as const,
		fileName: "launch.png",
		mimeType: "image/png",
		byteSize: 12_345,
		objectKey: "accounts/user-1/projects/project-1/assets/asset-1",
		reserveIdempotencyKey: "reserve-1",
		finalizeIdempotencyKey: null,
		checksum: "a".repeat(64),
		verifiedChecksum: null,
		width: 1920,
		height: 1080,
		durationMs: null,
		uploadStatus: "pending" as const,
		failureCode: null,
		createdAt: NOW,
		updatedAt: NOW,
		readyAt: null,
		deletedAt: null,
	};
}

function rawImageRow(overrides: Record<string, unknown> = {}) {
	return {
		...imageRow(),
		ownerId: "user-1",
		...overrides,
	};
}

function imageRowMetadata() {
	return {
		kind: "image" as const,
		fileName: "launch.png",
		mimeType: "image/png",
		byteSize: 12_345,
		checksum: "a".repeat(64),
		width: 1920,
		height: 1080,
	};
}

function scriptedDatabase(...rowSets: ReadonlyArray<readonly unknown[]>): CreatorDatabase {
	const queue = [...rowSets];
	return {
		execute: async () => ({ rows: queue.shift() ?? [] }),
	} as unknown as CreatorDatabase;
}

describe("asset repository persistence contract", () => {
	it("persists independent reservation and finalization idempotency keys", () => {
		expect(assets.reserveIdempotencyKey.notNull).toBe(true);
		expect(assets.finalizeIdempotencyKey.notNull).toBe(false);

		const config = getTableConfig(assets);
		const names = [
			...config.uniqueConstraints.map((constraint) => constraint.name),
			...config.indexes.map((index) => index.config.name),
		];
		expect(names).toContain("assets_project_reserve_idempotency_unique");
	});

	it("ships atomic database operations for quota, finalization and referenced deletion", () => {
		const migration = readFileSync(
			resolve("server/db/migrations/0002_futuristic_jasper_sitwell.sql"),
			"utf8",
		);
		expect(migration).toContain("typelapse_reserve_asset_v1");
		expect(migration).toContain("pg_advisory_xact_lock");
		expect(migration).toContain("typelapse_finalize_asset_v1");
		expect(migration).toContain("typelapse_delete_asset_v1");
		expect(migration).toContain("jsonb_path_exists");
		expect(migration).toContain("UPDATE assets SET reserve_idempotency_key = 'legacy:' || id");
	});

	it("revalidates an owned database row into a typed image record", () => {
		expect(assetRecordFromRow(imageRow(), "user-1")).toEqual({
			id: "asset-1",
			ownerId: "user-1",
			projectId: "project-1",
			objectKey: "accounts/user-1/projects/project-1/assets/asset-1",
			metadata: {
				kind: "image",
				fileName: "launch.png",
				mimeType: "image/png",
				byteSize: 12_345,
				checksum: "a".repeat(64),
				width: 1920,
				height: 1080,
			},
			status: "pending",
			reserveIdempotencyKey: "reserve-1",
			finalizeIdempotencyKey: null,
			verifiedChecksum: null,
			failureCode: null,
			createdAt: NOW,
			updatedAt: NOW,
			readyAt: null,
		});
	});

	it("reserves media against an owned project and returns the persisted record", async () => {
		const repository = createAssetRepository(
			scriptedDatabase(
				[{ outcome: "created", assetId: "asset-1", usedBytes: null, limitBytes: 100_000 }],
				[rawImageRow()],
			),
		);

		const result = await repository.reservePending({
			id: "asset-1",
			ownerId: "user-1",
			projectId: "project-1",
			objectKey: "accounts/user-1/projects/project-1/assets/asset-1",
			metadata: {
				kind: "image",
				fileName: "launch.png",
				mimeType: "image/png",
				byteSize: 12_345,
				checksum: "a".repeat(64),
				width: 1920,
				height: 1080,
			},
			idempotencyKey: "reserve-1",
			maxOwnerStorageBytes: 100_000,
			now: NOW,
		});

		expect(result).toMatchObject({ outcome: "created", asset: { id: "asset-1" } });
	});

	it("preserves replay, conflict, missing ownership and exact quota outcomes", async () => {
		const replay = createAssetRepository(
			scriptedDatabase(
				[{ outcome: "replayed", assetId: "asset-1", usedBytes: null, limitBytes: 100 }],
				[rawImageRow()],
			),
		);
		const quota = createAssetRepository(
			scriptedDatabase([
				{ outcome: "quota-exceeded", assetId: null, usedBytes: "90", limitBytes: "100" },
			]),
		);
		const conflict = createAssetRepository(
			scriptedDatabase([
				{ outcome: "idempotency-conflict", assetId: null, usedBytes: null, limitBytes: 100 },
			]),
		);
		const missing = createAssetRepository(
			scriptedDatabase([
				{ outcome: "not-found", assetId: null, usedBytes: null, limitBytes: 100 },
			]),
		);
		const command = {
			id: "asset-new",
			ownerId: "user-1",
			projectId: "project-1",
			objectKey: "private/new",
			metadata: imageRowMetadata(),
			idempotencyKey: "reserve-1",
			maxOwnerStorageBytes: 100,
			now: NOW,
		} as const;

		await expect(replay.reservePending(command)).resolves.toMatchObject({
			outcome: "replayed",
			asset: { id: "asset-1" },
		});
		await expect(quota.reservePending(command)).resolves.toEqual({
			outcome: "quota-exceeded",
			usedBytes: 90,
			limitBytes: 100,
		});
		await expect(conflict.reservePending(command)).resolves.toEqual({
			outcome: "idempotency-conflict",
		});
		await expect(missing.reservePending(command)).resolves.toEqual({ outcome: "not-found" });
	});

	it("returns only rows selected by the owner-scoped read boundary", async () => {
		const repository = createAssetRepository(
			scriptedDatabase(
				[],
				[
					rawImageRow(),
					rawImageRow({
						id: "asset-2",
						kind: "audio",
						fileName: "voice.mp3",
						mimeType: "audio/mpeg",
						width: null,
						height: null,
						durationMs: 4200,
					}),
				],
			),
		);

		await expect(repository.findOwnedById("user-2", "asset-1")).resolves.toBeNull();
		await expect(repository.listByOwner("user-1", "project-1")).resolves.toEqual([
			expect.objectContaining({ id: "asset-1", ownerId: "user-1" }),
			expect.objectContaining({
				id: "asset-2",
				metadata: expect.objectContaining({ kind: "audio", durationMs: 4200 }),
			}),
		]);
	});

	it("finalizes a pending upload with compare-and-set idempotency", async () => {
		const readyRow = rawImageRow({
			uploadStatus: "ready",
			finalizeIdempotencyKey: "finalize-1",
			verifiedChecksum: "a".repeat(64),
			readyAt: NOW,
		});
		const repository = createAssetRepository(
			scriptedDatabase(
				[
					{
						outcome: "ready",
						currentStatus: "ready",
						assetId: "asset-1",
						replayed: false,
					},
				],
				[readyRow],
			),
		);

		await expect(
			repository.finalizeReady({
				ownerId: "user-1",
				id: "asset-1",
				idempotencyKey: "finalize-1",
				verifiedChecksum: "a".repeat(64),
				now: NOW,
			}),
		).resolves.toMatchObject({
			outcome: "ready",
			replayed: false,
			asset: { status: "ready", finalizeIdempotencyKey: "finalize-1" },
		});
	});

	it("persists failed verification idempotently and fails closed on conflicting state", async () => {
		const failedRow = rawImageRow({
			uploadStatus: "failed",
			finalizeIdempotencyKey: "finalize-failed",
			failureCode: "checksum-mismatch",
		});
		const failed = createAssetRepository(
			scriptedDatabase(
				[
					{
						outcome: "failed",
						currentStatus: "failed",
						assetId: "asset-1",
						replayed: true,
					},
				],
				[failedRow],
			),
		);
		const invalid = createAssetRepository(
			scriptedDatabase([
				{
					outcome: "invalid-state",
					currentStatus: "ready",
					assetId: null,
					replayed: false,
				},
			]),
		);

		await expect(
			failed.markFailed({
				ownerId: "user-1",
				id: "asset-1",
				idempotencyKey: "finalize-failed",
				failureCode: "checksum-mismatch",
				now: NOW,
			}),
		).resolves.toMatchObject({
			outcome: "failed",
			replayed: true,
			asset: { failureCode: "checksum-mismatch" },
		});
		await expect(
			invalid.markFailed({
				ownerId: "user-1",
				id: "asset-1",
				idempotencyKey: "other",
				failureCode: "size-mismatch",
				now: NOW,
			}),
		).resolves.toEqual({ outcome: "invalid-state", status: "ready" });
	});

	it("deletes only an owned, unreferenced asset and keeps its object key internal", async () => {
		const deleted = createAssetRepository(
			scriptedDatabase([
				{
					outcome: "deleted",
					objectKey: "accounts/user-1/projects/project-1/assets/asset-1",
				},
			]),
		);
		const referenced = createAssetRepository(
			scriptedDatabase([{ outcome: "referenced", objectKey: null }]),
		);
		const foreign = createAssetRepository(
			scriptedDatabase([{ outcome: "not-found", objectKey: null }]),
		);

		await expect(deleted.deleteOwnedIfUnreferenced("user-1", "asset-1")).resolves.toEqual({
			outcome: "deleted",
		});
		await expect(
			referenced.deleteOwnedIfUnreferenced("user-1", "asset-1"),
		).resolves.toEqual({ outcome: "referenced" });
		await expect(foreign.deleteOwnedIfUnreferenced("user-2", "asset-1")).resolves.toEqual({
			outcome: "not-found",
		});
	});

	it("resolves only verified ready metadata for one owned project without storage details", async () => {
		const resolver = createHostedProjectAssetResolver(
			scriptedDatabase([
				rawImageRow({
					uploadStatus: "ready",
					verifiedChecksum: "a".repeat(64),
					readyAt: NOW,
				}),
			]),
		);

		const result = await resolver.resolveReadyForProject({
			ownerId: "user-1",
			projectId: "project-1",
			assetIds: ["asset-1", "foreign-or-pending"],
		});

		expect(result).toEqual([
			{
				id: "asset-1",
				metadata: expect.objectContaining({ kind: "image", fileName: "launch.png" }),
			},
		]);
		expect(result[0]).not.toHaveProperty("objectKey");
	});
});
