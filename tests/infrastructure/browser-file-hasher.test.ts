import type { PrivateMediaFile } from "@/application/assets/private-media-upload.port";
import { BrowserFileSha256Adapter } from "@/infrastructure/assets/browser-file-hasher";
import { describe, expect, it, vi } from "vitest";

function mediaFile(handle: unknown, byteSize = 3): PrivateMediaFile {
	return { name: "sample.bin", mimeType: "image/png", byteSize, opaqueHandle: handle };
}

const fakeDigest = async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
	expect(new Uint8Array(data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
	return new Uint8Array(32).fill(0xab).buffer;
};

describe("browser file SHA-256 adapter", () => {
	it("reads a browser file stream, reports chunk progress and emits lowercase hex", async () => {
		const handle = {
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new Uint8Array([1]));
						controller.enqueue(new Uint8Array([2, 3]));
						controller.close();
					},
				}),
		};
		const progress: Array<[number, number]> = [];
		const digest = vi.fn(fakeDigest);
		const adapter = new BrowserFileSha256Adapter({ digest });

		const checksum = await adapter.sha256(mediaFile(handle), {
			onProgress: ({ loadedBytes, totalBytes }) => {
				progress.push([loadedBytes, totalBytes]);
			},
		});

		expect(checksum).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
		expect(digest).not.toHaveBeenCalled();
		expect(progress).toEqual([
			[0, 3],
			[1, 3],
			[3, 3],
		]);
	});

	it("falls back to arrayBuffer when a stream is unavailable", async () => {
		const arrayBuffer = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer);
		const adapter = new BrowserFileSha256Adapter({ digest: fakeDigest });
		const progress: number[] = [];

		await adapter.sha256(mediaFile({ arrayBuffer }), {
			onProgress: ({ loadedBytes }) => progress.push(loadedBytes),
		});

		expect(arrayBuffer).toHaveBeenCalledOnce();
		expect(progress).toEqual([0, 3]);
	});

	it("keeps SHA-256 correct across chunk and padding boundaries", async () => {
		const bytes = new TextEncoder().encode(
			"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
		);
		const handle = {
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(bytes.subarray(0, 7));
						controller.enqueue(bytes.subarray(7, 33));
						controller.enqueue(bytes.subarray(33));
						controller.close();
					},
				}),
		};

		await expect(
			new BrowserFileSha256Adapter().sha256(mediaFile(handle, bytes.byteLength), {}),
		).resolves.toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
	});

	it("cancels an active stream and never digests after AbortSignal fires", async () => {
		const controller = new AbortController();
		const streamState: { controller?: ReadableStreamDefaultController<Uint8Array> } = {};
		const cancelled = vi.fn();
		const digest = vi.fn(fakeDigest);
		const handle = {
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(value) {
						streamState.controller = value;
					},
					cancel: cancelled,
				}),
		};
		const adapter = new BrowserFileSha256Adapter({ digest });
		const pending = adapter.sha256(mediaFile(handle), { signal: controller.signal });

		const streamController = streamState.controller;
		if (!streamController) throw new Error("Expected the test stream to start synchronously");
		streamController.enqueue(new Uint8Array([1]));
		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(cancelled).toHaveBeenCalledOnce();
		expect(digest).not.toHaveBeenCalled();
	});

	it("rejects a handle whose byte count differs from the safe descriptor", async () => {
		const adapter = new BrowserFileSha256Adapter({ digest: fakeDigest });

		await expect(
			adapter.sha256(
				mediaFile({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, 4),
				{},
			),
		).rejects.toMatchObject({ code: "invalid-file" });
	});
});
