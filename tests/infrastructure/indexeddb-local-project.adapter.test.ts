// @vitest-environment node
import "fake-indexeddb/auto";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { IndexedDbLocalProjectAdapter } from "@/infrastructure/project/indexeddb-local-project.adapter";
import { afterEach, describe, expect, it } from "vitest";

const adapters: IndexedDbLocalProjectAdapter[] = [];

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

	it("stores media bytes outside the project JSON and restores only owned asset content", async () => {
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
		await expect(
			local.loadAsset({ projectId: "other-project", assetId: "asset-1" }),
		).resolves.toBeNull();
		expect(JSON.stringify(document)).not.toContain("data:");
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
});
