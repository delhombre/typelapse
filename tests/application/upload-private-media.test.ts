import type {
	PrivateAssetApiPort,
	PrivateMediaFile,
	PrivateMediaMetadataPort,
	PrivateMediaSha256Port,
	PrivateMediaUploadError,
	SignedPutPort,
} from "@/application/assets/private-media-upload.port";
import { createUploadPrivateMedia } from "@/application/assets/upload-private-media";
import type { AssetMetadata } from "@/domain/entities/asset";
import { describe, expect, it } from "vitest";

const SHA256 = "a".repeat(64);
const FILE: PrivateMediaFile = {
	name: "cover.png",
	mimeType: "image/png",
	byteSize: 12,
	opaqueHandle: { private: true },
};

function createHarness(
	overrides: {
		readonly hasher?: PrivateMediaSha256Port;
		readonly metadata?: PrivateMediaMetadataPort;
		readonly api?: PrivateAssetApiPort;
		readonly uploader?: SignedPutPort;
		readonly keys?: readonly string[];
	} = {},
) {
	const events: string[] = [];
	const metadata: AssetMetadata = {
		kind: "image",
		fileName: FILE.name,
		mimeType: FILE.mimeType,
		byteSize: FILE.byteSize,
		checksum: SHA256,
		width: 640,
		height: 480,
	};
	const hasher: PrivateMediaSha256Port = overrides.hasher ?? {
		sha256: async (_file, options) => {
			events.push("hash");
			options.onProgress?.({ loadedBytes: 12, totalBytes: 12 });
			return SHA256;
		},
	};
	const inspector: PrivateMediaMetadataPort = overrides.metadata ?? {
		inspect: async () => {
			events.push("inspect");
			return { kind: "image", width: 640, height: 480 };
		},
	};
	const api: PrivateAssetApiPort = overrides.api ?? {
		reserve: async (input) => {
			events.push(`reserve:${input.idempotencyKey}`);
			return {
				asset: { id: "asset-1", projectId: input.projectId, metadata, status: "pending" },
				upload: {
					method: "PUT",
					url: "https://objects.example.test/upload",
					headers: { "content-type": "image/png", "x-signed": "yes" },
					checksum: { algorithm: "sha256", value: SHA256 },
					expiresAt: new Date("2026-08-30T12:15:00.000Z"),
				},
			};
		},
		finalize: async (input) => {
			events.push(`finalize:${input.idempotencyKey}`);
			return {
				asset: { id: input.assetId, projectId: "project-1", metadata, status: "ready" },
			};
		},
		resolveContent: async (input) => {
			events.push("resolve");
			return {
				method: "GET",
				url: `https://objects.example.test/private/${input.assetId}`,
				expiresAt: new Date("2026-08-30T12:05:00.000Z"),
			};
		},
	};
	const uploader: SignedPutPort = overrides.uploader ?? {
		put: async (_file, _upload, options) => {
			events.push("put");
			options.onProgress?.({ loadedBytes: 12, totalBytes: 12 });
		},
	};
	const keys = [...(overrides.keys ?? ["reserve-key", "finalize-key"])];
	const useCase = createUploadPrivateMedia({
		hasher,
		metadata: inspector,
		api,
		uploader,
		createIdempotencyKey: () => keys.shift() ?? "missing-key",
	});

	return { events, useCase, ports: { api } };
}

describe("upload private media", () => {
	it("runs the private upload protocol in strict order and returns ephemeral GET access", async () => {
		const { events, useCase } = createHarness();
		const progress: string[] = [];

		const result = await useCase.execute(
			{ file: FILE, projectId: "project-1" },
			{
				onProgress: (event) => {
					progress.push(event.phase);
				},
			},
		);

		expect(events).toEqual([
			"hash",
			"inspect",
			"reserve:reserve-key",
			"put",
			"finalize:finalize-key",
			"resolve",
		]);
		expect(progress).toEqual([
			"hashing",
			"hashing",
			"inspecting",
			"reserving",
			"uploading",
			"uploading",
			"finalizing",
			"resolving",
			"complete",
		]);
		expect(result.asset.status).toBe("ready");
		expect(result.access).toMatchObject({
			method: "GET",
			url: "https://objects.example.test/private/asset-1",
		});
		expect(JSON.stringify(result)).not.toContain("opaqueHandle");
	});

	it("builds serializable video metadata without placing the opaque file handle in it", async () => {
		let reservedMetadata: AssetMetadata | null = null;
		const video: PrivateMediaFile = {
			name: "demo.mp4",
			mimeType: "video/mp4",
			byteSize: 42,
			opaqueHandle: new Uint8Array([1, 2, 3]),
		};
		const { useCase } = createHarness({
			metadata: {
				inspect: async () => ({
					kind: "video",
					width: 1920,
					height: 1080,
					durationMs: 1_250,
				}),
			},
			api: {
				reserve: async (input) => {
					reservedMetadata = input.metadata;
					return {
						asset: {
							id: "asset-video",
							projectId: input.projectId,
							metadata: input.metadata,
							status: "pending",
						},
						upload: {
							method: "PUT",
							url: "https://objects.example.test/upload",
							headers: {},
							checksum: { algorithm: "sha256", value: SHA256 },
							expiresAt: new Date("2026-08-30T12:15:00.000Z"),
						},
					};
				},
				finalize: async (input) => ({
					asset: {
						id: input.assetId,
						projectId: "project-1",
						metadata: reservedMetadata as unknown as AssetMetadata,
						status: "ready",
					},
				}),
				resolveContent: async () => ({
					method: "GET",
					url: "https://objects.example.test/private/asset-video",
					expiresAt: new Date("2026-08-30T12:05:00.000Z"),
				}),
			},
		});

		await useCase.execute({ file: video, projectId: "project-1" });

		expect(reservedMetadata).toEqual({
			kind: "video",
			fileName: "demo.mp4",
			mimeType: "video/mp4",
			byteSize: 42,
			checksum: SHA256,
			width: 1920,
			height: 1080,
			durationMs: 1_250,
		});
		expect(reservedMetadata).not.toHaveProperty("opaqueHandle");
	});

	it("refuses a signed upload whose checksum does not match the local SHA-256", async () => {
		let putCalled = false;
		const { useCase } = createHarness({
			api: {
				reserve: async (input) => ({
					asset: {
						id: "asset-1",
						projectId: input.projectId,
						metadata: input.metadata,
						status: "pending",
					},
					upload: {
						method: "PUT",
						url: "https://objects.example.test/upload",
						headers: {},
						checksum: { algorithm: "sha256", value: "b".repeat(64) },
						expiresAt: new Date("2026-08-30T12:15:00.000Z"),
					},
				}),
				finalize: async () => {
					throw new Error("must not finalize");
				},
				resolveContent: async () => {
					throw new Error("must not resolve");
				},
			},
			uploader: {
				put: async () => {
					putCalled = true;
				},
			},
		});

		await expect(useCase.execute({ file: FILE, projectId: "project-1" })).rejects.toMatchObject({
			code: "signed-upload-mismatch",
		});
		expect(putCalled).toBe(false);
	});

	it("requires a distinct finalization key and never retries a collision", async () => {
		const { events, useCase } = createHarness({ keys: ["same-key", "same-key"] });

		await expect(useCase.execute({ file: FILE, projectId: "project-1" })).rejects.toEqual(
			expect.objectContaining<Partial<PrivateMediaUploadError>>({
				code: "idempotency-key-collision",
			}),
		);
		expect(events).toEqual(["hash", "inspect", "reserve:same-key", "put"]);
	});

	it("checks cancellation after every awaited effect before starting the next one", async () => {
		const controller = new AbortController();
		const { events, useCase } = createHarness({
			hasher: {
				sha256: async () => {
					controller.abort();
					return SHA256;
				},
			},
		});

		await expect(
			useCase.execute({ file: FILE, projectId: "project-1" }, { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(events).toEqual([]);
	});

	it("propagates one AbortSignal through every port without a retry", async () => {
		const controller = new AbortController();
		const signals: AbortSignal[] = [];
		const capture = (signal: AbortSignal | undefined) => {
			if (signal) signals.push(signal);
		};
		const base = createHarness();
		const { useCase } = createHarness({
			hasher: {
				sha256: async (_file, options) => {
					capture(options.signal);
					return SHA256;
				},
			},
			metadata: {
				inspect: async (_file, options) => {
					capture(options.signal);
					return { kind: "image", width: 1, height: 1 };
				},
			},
			api: {
				reserve: async (input, options) => {
					capture(options.signal);
					return base.ports.api.reserve(input, options);
				},
				finalize: async (input, options) => {
					capture(options.signal);
					return base.ports.api.finalize(input, options);
				},
				resolveContent: async (input, options) => {
					capture(options.signal);
					return base.ports.api.resolveContent(input, options);
				},
			},
			uploader: {
				put: async (_file, _upload, options) => {
					capture(options.signal);
				},
			},
		});

		await useCase.execute({ file: FILE, projectId: "project-1" }, { signal: controller.signal });

		expect(signals).toHaveLength(6);
		expect(signals.every((signal) => signal === controller.signal)).toBe(true);
	});

	it.each([
		[{ kind: "image", width: 0, height: 10 }, "invalid-metadata"],
		[{ kind: "audio", durationMs: Number.NaN }, "invalid-metadata"],
		[{ kind: "video", width: 10, height: 10, durationMs: 0 }, "invalid-metadata"],
	] as const)("rejects invalid extracted metadata before reservation", async (inspection, code) => {
		const { events, useCase } = createHarness({
			metadata: { inspect: async () => inspection },
		});

		await expect(useCase.execute({ file: FILE, projectId: "project-1" })).rejects.toMatchObject({
			code,
		});
		expect(events).toEqual(["hash"]);
	});
});
