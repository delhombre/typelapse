// @vitest-environment node
import "fake-indexeddb/auto";
import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addMediaAsset } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { Asset } from "@/domain/entities/asset";
import { IndexedDbLocalProjectAdapter } from "@/infrastructure/project/indexeddb-local-project.adapter";
import { afterEach, describe, expect, it } from "vitest";

const adapters: IndexedDbLocalProjectAdapter[] = [];

function titled(projectId: string, title: string) {
	const document = createStarterMultimediaProject({ projectId });
	return { ...document, project: { ...document.project, title } };
}

/** A project whose one scene shows each of these images. */
function withImages(projectId: string, assetIds: readonly string[]): ProjectDocumentV2 {
	const hydrated = hydrateProjectDocument(
		createStarterMultimediaProject({ projectId, sceneId: `${projectId}-scene` }),
	);
	let project = hydrated.project;
	for (const assetId of assetIds) {
		const asset = Asset.create({
			id: assetId,
			kind: "image",
			fileName: `${assetId}.png`,
			mimeType: "image/png",
			byteSize: 4,
			checksum: "a".repeat(64),
			width: 10,
			height: 10,
		});
		project = addMediaAsset(project, `${projectId}-scene`, asset, { blockId: `${assetId}-block` });
	}
	return serializeProjectDocument({ ...hydrated, project });
}

async function storeBlob(local: IndexedDbLocalProjectAdapter, projectId: string, assetId: string) {
	await local.saveAsset({
		projectId,
		assetId,
		mimeType: "image/png",
		byteSize: 4,
		opaqueHandle: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
	});
}

function adapter() {
	const instance = new IndexedDbLocalProjectAdapter({
		databaseName: `typelapse-test-${crypto.randomUUID()}`,
	});
	adapters.push(instance);
	return instance;
}

afterEach(async () => {
	await Promise.all(adapters.splice(0).map((instance) => instance.destroy()));
});

describe("IndexedDbLocalProjectAdapter", () => {
	it("round-trips the canonical current project without weakening validation", async () => {
		const local = adapter();
		const document = createStarterMultimediaProject({ projectId: "project-1" });

		await local.saveProject(document);

		await expect(local.loadCurrent()).resolves.toEqual(document);
	});

	it("stores media bytes outside the project JSON and restores them by asset id", async () => {
		const local = adapter();
		const document = createStarterMultimediaProject({ projectId: "project-1" });
		const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });

		await local.saveAsset({
			projectId: "project-1",
			assetId: "asset-1",
			mimeType: "image/png",
			byteSize: 4,
			opaqueHandle: blob,
		});

		const restored = await local.loadAsset({ projectId: "project-1", assetId: "asset-1" });
		expect(restored).toMatchObject({ assetId: "asset-1", mimeType: "image/png", byteSize: 4 });
		expect(restored?.opaqueHandle).toBeInstanceOf(Blob);
		// A project file opened into another local project references the same
		// asset ids; the bytes on this device are the same bytes, so it reads them.
		await expect(
			local.loadAsset({ projectId: "other-project", assetId: "asset-1" }),
		).resolves.toMatchObject({ assetId: "asset-1", byteSize: 4 });
		await expect(
			local.loadAsset({ projectId: "project-1", assetId: "missing" }),
		).resolves.toBeNull();
		expect(JSON.stringify(document)).not.toContain("data:");
	});

	it("keeps one composition per local project", async () => {
		const local = adapter();
		const alpha = titled("alpha", "Alpha");
		const beta = titled("beta", "Beta");

		await local.saveProject(alpha);
		await local.saveProject(beta);

		await expect(local.loadProject("alpha")).resolves.toEqual(alpha);
		await expect(local.loadProject("beta")).resolves.toEqual(beta);
		await expect(local.loadProject("gamma")).resolves.toBeNull();
	});

	it("moves the single legacy composition onto a local project exactly once", async () => {
		const local = adapter();
		const legacy = titled("studio-project", "Draft");
		await local.saveProject(legacy);

		const moved = await local.moveProject("studio-project", "slot-1");

		expect(moved?.project.id).toBe("slot-1");
		expect(moved?.project.title).toBe("Draft");
		await expect(local.loadProject("slot-1")).resolves.toEqual(moved);
		await expect(local.loadProject("studio-project")).resolves.toBeNull();
		await expect(local.moveProject("studio-project", "slot-2")).resolves.toBeNull();
		await expect(local.loadProject("slot-2")).resolves.toBeNull();
	});

	it("refuses non-Blob or descriptor-mismatched media instead of persisting ambiguous bytes", async () => {
		const local = adapter();

		await expect(
			local.saveAsset({
				projectId: "project-1",
				assetId: "asset-1",
				mimeType: "image/png",
				byteSize: 4,
				opaqueHandle: new Uint8Array([1, 2, 3, 4]),
			}),
		).rejects.toThrow(/Blob/);
		await expect(
			local.saveAsset({
				projectId: "project-1",
				assetId: "asset-2",
				mimeType: "image/png",
				byteSize: 5,
				opaqueHandle: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
			}),
		).rejects.toThrow(/size/);
	});

	it("lists stored media per project and deletes one blob", async () => {
		const local = adapter();
		await storeBlob(local, "alpha", "a-1");
		await storeBlob(local, "alpha", "a-2");
		await storeBlob(local, "beta", "b-1");

		expect((await local.listAssets("alpha")).map((asset) => asset.assetId).sort()).toEqual([
			"a-1",
			"a-2",
		]);
		expect(await local.listAssets()).toHaveLength(3);

		await local.deleteAsset("a-1");
		await local.deleteAsset("missing");

		expect((await local.listAssets()).map((asset) => asset.assetId).sort()).toEqual(["a-2", "b-1"]);
		await expect(local.loadAsset({ projectId: "alpha", assetId: "a-1" })).resolves.toBeNull();
	});

	it("deletes only the blobs that no stored project and no kept id references", async () => {
		const local = adapter();
		// Alpha shows a-kept; beta shows a-shared, a blob alpha imported: a project
		// file opened into another project reads the same bytes by asset id.
		await local.saveProject(withImages("alpha", ["a-kept"]));
		await local.saveProject(withImages("beta", ["a-shared"]));
		for (const assetId of ["a-kept", "a-shared", "a-orphan", "a-live"]) {
			await storeBlob(local, "alpha", assetId);
		}

		const deleted = await local.deleteUnreferencedAssets(["a-live"]);

		expect(deleted).toEqual(["a-orphan"]);
		expect((await local.listAssets()).map((asset) => asset.assetId).sort()).toEqual([
			"a-kept",
			"a-live",
			"a-shared",
		]);
	});

	it("deletes nothing when a stored project cannot be read, since its references are unknown", async () => {
		const databaseName = `typelapse-test-${crypto.randomUUID()}`;
		const local = new IndexedDbLocalProjectAdapter({ databaseName });
		adapters.push(local);
		await local.saveProject(withImages("alpha", []));
		await storeBlob(local, "alpha", "a-orphan");
		const raw = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(databaseName);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const transaction = raw.transaction("projects", "readwrite");
			transaction.objectStore("projects").put({ id: "broken", document: { schemaVersion: 9 } });
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
		raw.close();

		await expect(local.deleteUnreferencedAssets()).resolves.toEqual([]);
		expect(await local.listAssets()).toHaveLength(1);
	});
});
