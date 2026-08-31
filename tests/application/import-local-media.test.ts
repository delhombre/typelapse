import { createImportLocalMedia } from "@/application/assets/import-local-media";
import type {
	PrivateMediaFile,
	PrivateMediaMetadataPort,
	PrivateMediaSha256Port,
} from "@/application/assets/private-media-upload.port";
import type { LocalSceneAssetSourceFactoryPort } from "@/application/assets/scene-asset-source.port";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { describe, expect, it, vi } from "vitest";

const CHECKSUM = "a".repeat(64);

function imageFile(overrides: Partial<PrivateMediaFile> = {}): PrivateMediaFile {
	return {
		name: "hero.png",
		mimeType: "image/png",
		byteSize: 42,
		opaqueHandle: { privateBytes: "must-not-leak" },
		...overrides,
	};
}

function dependencies() {
	const hasher: PrivateMediaSha256Port = {
		sha256: vi.fn(async () => CHECKSUM),
	};
	const metadata: PrivateMediaMetadataPort = {
		inspect: vi.fn(async () => ({ kind: "image" as const, width: 1600, height: 900 })),
	};
	const release = vi.fn();
	const sourceFactory: LocalSceneAssetSourceFactoryPort = {
		create: vi.fn((assetId) => ({
			source: { assetId, src: `blob:${assetId}` },
			release,
		})),
	};
	const registry = createSceneAssetSourceRegistry();
	return { hasher, metadata, release, sourceFactory, registry };
}

describe("import local media", () => {
	it("creates canonical Asset metadata while keeping its object URL and file handle transient", async () => {
		const deps = dependencies();
		const importer = createImportLocalMedia({
			...deps,
			createAssetId: () => "asset-local-1",
		});

		const result = await importer.execute({ file: imageFile() });

		expect(result.asset.id).toBe("asset-local-1");
		expect(result.asset.metadata).toEqual({
			kind: "image",
			fileName: "hero.png",
			mimeType: "image/png",
			byteSize: 42,
			checksum: CHECKSUM,
			width: 1600,
			height: 900,
		});
		expect(result.source).toEqual({ assetId: "asset-local-1", src: "blob:asset-local-1" });
		expect(deps.registry.resolve("asset-local-1")).toEqual(result.source);
		const serializedAsset = JSON.stringify(result.asset);
		expect(serializedAsset).not.toContain("blob:");
		expect(serializedAsset).not.toContain("data:");
		expect(serializedAsset).not.toContain("must-not-leak");
		expect(serializedAsset).not.toContain("src");
	});

	it("creates a video Asset from validated dimensions and duration", async () => {
		const deps = dependencies();
		deps.metadata.inspect = vi.fn(async () => ({
			kind: "video" as const,
			width: 1920,
			height: 1080,
			durationMs: 12_500,
		}));
		const importer = createImportLocalMedia({
			...deps,
			createAssetId: () => "asset-video-1",
		});

		const result = await importer.execute({
			file: imageFile({ name: "demo.mp4", mimeType: "video/mp4", byteSize: 1_024 }),
		});

		expect(result.asset.metadata).toEqual({
			kind: "video",
			fileName: "demo.mp4",
			mimeType: "video/mp4",
			byteSize: 1_024,
			checksum: CHECKSUM,
			width: 1920,
			height: 1080,
			durationMs: 12_500,
		});
	});

	it("creates an audio Asset with duration and no invented dimensions", async () => {
		const deps = dependencies();
		deps.metadata.inspect = vi.fn(async () => ({ kind: "audio" as const, durationMs: 3_250 }));
		const importer = createImportLocalMedia({
			...deps,
			createAssetId: () => "asset-audio-1",
		});

		const result = await importer.execute({
			file: imageFile({ name: "voice.mp3", mimeType: "audio/mpeg", byteSize: 512 }),
		});

		expect(result.asset.metadata).toEqual({
			kind: "audio",
			fileName: "voice.mp3",
			mimeType: "audio/mpeg",
			byteSize: 512,
			checksum: CHECKSUM,
			durationMs: 3_250,
		});
	});

	it("rejects SVG and non-media files before hashing, probing, or allocating a source", async () => {
		const deps = dependencies();
		const importer = createImportLocalMedia({
			...deps,
			createAssetId: () => "must-not-be-used",
		});

		for (const file of [
			imageFile({ name: "vector.bin", mimeType: "image/svg" }),
			imageFile({ name: "notes.pdf", mimeType: "application/pdf" }),
		]) {
			await expect(importer.execute({ file })).rejects.toMatchObject({
				code: "unsupported-media-type",
			});
		}

		expect(deps.hasher.sha256).not.toHaveBeenCalled();
		expect(deps.metadata.inspect).not.toHaveBeenCalled();
		expect(deps.sourceFactory.create).not.toHaveBeenCalled();
	});

	it("releases a malformed source lease instead of registering it for another asset", async () => {
		const deps = dependencies();
		deps.sourceFactory.create = vi.fn(() => ({
			source: { assetId: "asset-foreign", src: "blob:foreign" },
			release: deps.release,
		}));
		const importer = createImportLocalMedia({
			...deps,
			createAssetId: () => "asset-local-1",
		});

		await expect(importer.execute({ file: imageFile() })).rejects.toMatchObject({
			code: "invalid-response",
		});
		expect(deps.release).toHaveBeenCalledOnce();
		expect(deps.registry.resolve("asset-local-1")).toBeNull();
		expect(deps.registry.resolve("asset-foreign")).toBeNull();
	});

	it("propagates AbortSignal through hashing and metadata and stops before source allocation", async () => {
		const controller = new AbortController();
		const deps = dependencies();
		deps.hasher.sha256 = vi.fn(async (_file, options) => {
			expect(options.signal).toBe(controller.signal);
			return CHECKSUM;
		});
		deps.metadata.inspect = vi.fn(async (_file, options) => {
			expect(options.signal).toBe(controller.signal);
			controller.abort();
			return { kind: "image" as const, width: 1600, height: 900 };
		});
		const importer = createImportLocalMedia({
			...deps,
			createAssetId: () => "asset-local-1",
		});

		await expect(
			importer.execute({ file: imageFile() }, { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(deps.sourceFactory.create).not.toHaveBeenCalled();
		expect(deps.registry.resolve("asset-local-1")).toBeNull();
	});
});
