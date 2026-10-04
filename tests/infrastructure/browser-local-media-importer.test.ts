// @vitest-environment jsdom
import type {
	PrivateMediaMetadataPort,
	PrivateMediaSha256Port,
} from "@/application/assets/private-media-upload.port";
import {
	type BrowserObjectUrlEnvironment,
	createBrowserLocalMediaImporter,
} from "@/infrastructure/assets/browser-local-media-importer";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { describe, expect, it, vi } from "vitest";

const CHECKSUM = "b".repeat(64);

describe("browser local media importer", () => {
	it("imports a real File and gives its object URL to the runtime registry only", async () => {
		const file = new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" });
		const hasher: PrivateMediaSha256Port = {
			sha256: vi.fn(async () => CHECKSUM),
		};
		const metadata: PrivateMediaMetadataPort = {
			inspect: vi.fn(async () => ({ kind: "image" as const, width: 1200, height: 630 })),
		};
		const objectUrls: BrowserObjectUrlEnvironment = {
			createObjectURL: vi.fn(() => "blob:cover-private"),
			revokeObjectURL: vi.fn(),
		};
		const registry = createSceneAssetSourceRegistry();
		const importer = createBrowserLocalMediaImporter({
			registry,
			hasher,
			metadata,
			objectUrls,
			createAssetId: () => "asset-cover",
		});

		const result = await importer.importFile(file);

		expect(result.asset.metadata).toMatchObject({
			fileName: "cover.png",
			mimeType: "image/png",
			byteSize: 3,
			checksum: CHECKSUM,
			width: 1200,
			height: 630,
		});
		expect(registry.resolve("asset-cover")).toEqual({
			assetId: "asset-cover",
			src: "blob:cover-private",
		});
		expect(JSON.stringify(result.asset)).not.toContain("blob:cover-private");
		expect(registry.revoke("asset-cover")).toBe(true);
		expect(objectUrls.revokeObjectURL).toHaveBeenCalledOnce();
		expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith("blob:cover-private");
	});

	it("rejects a non-object URL instead of falling back to serialized media", async () => {
		const file = new File([new Uint8Array([1])], "cover.png", { type: "image/png" });
		const registry = createSceneAssetSourceRegistry();
		const objectUrls: BrowserObjectUrlEnvironment = {
			createObjectURL: vi.fn(() => "data:image/png;base64,AQ=="),
			revokeObjectURL: vi.fn(),
		};
		const importer = createBrowserLocalMediaImporter({
			registry,
			hasher: { sha256: async () => CHECKSUM },
			metadata: { inspect: async () => ({ kind: "image", width: 1, height: 1 }) },
			objectUrls,
			createAssetId: () => "asset-cover",
		});

		await expect(importer.importFile(file)).rejects.toMatchObject({ code: "unavailable" });
		expect(registry.resolve("asset-cover")).toBeNull();
		expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith("data:image/png;base64,AQ==");
	});

	it("revokes an object URL allocated just before cancellation", async () => {
		const controller = new AbortController();
		const file = new File([new Uint8Array([1])], "cover.png", { type: "image/png" });
		const registry = createSceneAssetSourceRegistry();
		const objectUrls: BrowserObjectUrlEnvironment = {
			createObjectURL: vi.fn(() => {
				controller.abort();
				return "blob:aborted-cover";
			}),
			revokeObjectURL: vi.fn(),
		};
		const importer = createBrowserLocalMediaImporter({
			registry,
			hasher: { sha256: async () => CHECKSUM },
			metadata: { inspect: async () => ({ kind: "image", width: 1, height: 1 }) },
			objectUrls,
			createAssetId: () => "asset-cover",
		});

		await expect(importer.importFile(file, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(objectUrls.revokeObjectURL).toHaveBeenCalledOnce();
		expect(objectUrls.revokeObjectURL).toHaveBeenCalledWith("blob:aborted-cover");
		expect(registry.resolve("asset-cover")).toBeNull();
	});
});
