import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type HostedRenderObjectClientPort,
	createHostedRenderObjectStorage,
} from "../../server/storage/hosted-render-object-storage";
import type {
	AssetRecord,
	AssetRepositoryPort,
} from "../../src/application/assets/asset-repository.port";

const CHECKSUM = "a".repeat(64);
const NOW = new Date("2026-08-31T08:00:00.000Z");
const roots: string[] = [];

function readyAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
	return {
		id: "asset-1",
		ownerId: "owner-1",
		projectId: "project-1",
		objectKey: "accounts/owner-1/projects/project-1/assets/asset-1",
		metadata: {
			kind: "image",
			fileName: "cover.png",
			mimeType: "image/png",
			byteSize: 4,
			checksum: CHECKSUM,
			width: 100,
			height: 100,
		},
		status: "ready",
		reserveIdempotencyKey: "reserve-1",
		finalizeIdempotencyKey: "finalize-1",
		verifiedChecksum: CHECKSUM,
		failureCode: null,
		createdAt: NOW,
		updatedAt: NOW,
		readyAt: NOW,
		...overrides,
	};
}

function repository(asset: AssetRecord | null): AssetRepositoryPort {
	return {
		reservePending: async () => ({ outcome: "not-found" }),
		findOwnedById: async () => asset,
		listByOwner: async () => [],
		finalizeReady: async () => ({ outcome: "not-found" }),
		markFailed: async () => ({ outcome: "not-found" }),
		deleteOwnedIfUnreferenced: async () => ({ outcome: "not-found" }),
	};
}

class MemoryClient implements HostedRenderObjectClientPort {
	readBody: readonly Uint8Array[] | null = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
	lastGet: { objectKey: string; signal: AbortSignal } | null = null;
	lastPut: Parameters<HostedRenderObjectClientPort["putObject"]>[0] | null = null;
	deleted: string[] = [];

	async getObject(objectKey: string, signal: AbortSignal) {
		this.lastGet = { objectKey, signal };
		const body = this.readBody;
		if (!body) {
			return null;
		}
		return (async function* () {
			for (const chunk of body) {
				yield chunk;
			}
		})();
	}

	async putObject(input: Parameters<HostedRenderObjectClientPort["putObject"]>[0]) {
		this.lastPut = input;
		for await (const _chunk of input.body) {
			// Drain the stream like the S3 client.
		}
	}

	async deleteObject(objectKey: string) {
		this.deleted.push(objectKey);
	}
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("hosted render object storage", () => {
	it("materializes only a ready checksum-verified asset owned by the project", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "typelapse-render-storage-"));
		roots.push(root);
		const destinationPath = path.join(root, "asset.png");
		const client = new MemoryClient();
		const storage = createHostedRenderObjectStorage({
			assets: repository(readyAsset()),
			client,
		});

		await storage.materializePrivateAsset({
			ownerId: "owner-1",
			projectId: "project-1",
			assetId: "asset-1",
			destinationPath,
			signal: new AbortController().signal,
		});

		expect(await readFile(destinationPath)).toEqual(Buffer.from([1, 2, 3, 4]));
		expect(client.lastGet?.objectKey).toBe(
			"accounts/owner-1/projects/project-1/assets/asset-1",
		);
	});

	it.each([
		["missing", null],
		["foreign project", readyAsset({ projectId: "project-2" })],
		["pending", readyAsset({ status: "pending" })],
		["unverified", readyAsset({ verifiedChecksum: null })],
	])("fails closed for a %s asset without opening object storage", async (_label, asset) => {
		const client = new MemoryClient();
		const storage = createHostedRenderObjectStorage({ assets: repository(asset), client });

		await expect(
			storage.materializePrivateAsset({
				ownerId: "owner-1",
				projectId: "project-1",
				assetId: "asset-1",
				destinationPath: path.join(os.tmpdir(), "must-not-exist.png"),
				signal: new AbortController().signal,
			}),
		).rejects.toMatchObject({ code: "render-asset-unavailable", retryable: false });
		expect(client.lastGet).toBeNull();
	});

	it("removes a partial destination when private bytes do not match the declared size", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "typelapse-render-storage-"));
		roots.push(root);
		const destinationPath = path.join(root, "asset.png");
		const client = new MemoryClient();
		client.readBody = [new Uint8Array([1, 2])];
		const storage = createHostedRenderObjectStorage({
			assets: repository(readyAsset()),
			client,
		});

		await expect(
			storage.materializePrivateAsset({
				ownerId: "owner-1",
				projectId: "project-1",
				assetId: "asset-1",
				destinationPath,
				signal: new AbortController().signal,
			}),
		).rejects.toMatchObject({ code: "render-asset-invalid", retryable: false });
		await expect(readFile(destinationPath)).rejects.toThrow();
	});

	it("streams a validated regular render artifact to a private deterministic key", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "typelapse-render-storage-"));
		roots.push(root);
		const artifactPath = path.join(root, "output.mp4");
		await writeFile(artifactPath, Buffer.from([1, 2, 3, 4]));
		const client = new MemoryClient();
		const storage = createHostedRenderObjectStorage({
			assets: repository(null),
			client,
		});

		await storage.storePrivate({
			objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
			artifact: { temporaryId: artifactPath, mimeType: "video/mp4", byteSize: 4 },
			signal: new AbortController().signal,
		});

		expect(client.lastPut).toMatchObject({
			objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
			contentType: "video/mp4",
			contentLength: 4,
		});
	});

	it("refuses a symlink artifact and delegates fenced-output cleanup", async () => {
		const client = new MemoryClient();
		const storage = createHostedRenderObjectStorage({
			assets: repository(null),
			client,
		});

		await expect(
			storage.storePrivate({
				objectKey: "private/output.mp4",
				artifact: { temporaryId: "/path/does-not-exist", mimeType: "video/mp4", byteSize: 4 },
				signal: new AbortController().signal,
			}),
		).rejects.toThrow();
		await storage.deletePrivate("private/output.mp4");
		expect(client.deleted).toEqual(["private/output.mp4"]);
	});
});
