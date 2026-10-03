// @vitest-environment node
import "fake-indexeddb/auto";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { IndexedDbLocalProjectAdapter } from "@/infrastructure/project/indexeddb-local-project.adapter";
import { afterEach, describe, expect, it } from "vitest";

const adapters: IndexedDbLocalProjectAdapter[] = [];

function titled(projectId: string, title: string) {
	const document = createStarterMultimediaProject({ projectId });
	return { ...document, project: { ...document.project, title } };
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
});
