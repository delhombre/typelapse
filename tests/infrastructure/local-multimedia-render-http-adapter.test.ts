// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { LocalProjectLibraryPort } from "../../src/application/project/local-project-library.port";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";
import { LocalMultimediaRenderHttpAdapter } from "../../src/infrastructure/export/local-multimedia-render-http.adapter";

const document: ProjectDocumentV2 = {
	schemaVersion: 2,
	project: {
		id: "project-local",
		title: "A mixed story",
		canvas: { width: 1920, height: 1080, background: "#111111" },
		settings: {
			progressStyle: "none",
			transitionMs: 650,
			typewriter: false,
			focusZoom: false,
		},
		assets: [
			{
				id: "image-1",
				kind: "image",
				fileName: "frame.png",
				mimeType: "image/png",
				byteSize: 3,
				checksum: "checksum",
				width: 100,
				height: 100,
			},
		],
		audioCues: [],
		scenes: [{ id: "scene-1", durationMs: 1_000, blocks: [] }],
	},
};

function library(blob: Blob | null): LocalProjectLibraryPort {
	return {
		loadCurrent: async () => null,
		saveProject: async () => undefined,
		saveAsset: async () => undefined,
		loadAsset: async () =>
			blob
				? {
						assetId: "image-1",
						mimeType: "image/png",
						byteSize: blob.size,
						opaqueHandle: blob,
					}
				: null,
	};
}

describe("local multimedia render HTTP adapter", () => {
	it("invokes a browser fetch with the global receiver instead of the adapter instance", async () => {
		const receiverAwareFetch = function (this: unknown) {
			if (this !== globalThis) {
				throw new TypeError("Illegal invocation");
			}
			return Promise.resolve(
				new Response(new Uint8Array([1]), {
					status: 200,
					headers: { "content-type": "video/mp4" },
				}),
			);
		} as typeof fetch;
		const adapter = new LocalMultimediaRenderHttpAdapter(
			library(new Blob(["img"])),
			receiverAwareFetch,
		);

		await expect(
			adapter.render({
				document,
				options: {
					format: "mp4",
					width: 1920,
					height: 1080,
					fps: 30,
					includeAudio: false,
				},
			}),
		).resolves.toHaveProperty("size", 1);
	});

	it("posts canonical JSON and the exact IndexedDB media to the account-free local renderer", async () => {
		const capture: { request?: Request } = {};
		const fetcher: typeof fetch = async (input, init) => {
			capture.request = new Request(
				typeof input === "string" ? new URL(input, "http://localhost") : input,
				init,
			);
			return new Response(new Uint8Array([9, 8, 7]), {
				status: 200,
				headers: { "content-type": "video/mp4" },
			});
		};
		const adapter = new LocalMultimediaRenderHttpAdapter(library(new Blob(["img"])), fetcher);

		const output = await adapter.render({
			document,
			options: {
				format: "mp4",
				width: 1920,
				height: 1080,
				fps: 30,
				includeAudio: true,
			},
		});

		expect(capture.request?.url).toBe("http://localhost/api/render/v2");
		expect(capture.request?.method).toBe("POST");
		const form = await capture.request?.formData();
		expect(JSON.parse(String(form?.get("document")))).toEqual(document);
		expect(JSON.parse(String(form?.get("options")))).toEqual({
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 30,
			includeAudio: true,
		});
		expect(form?.get("asset:image-1")).toBeInstanceOf(File);
		expect(output.type).toBe("video/mp4");
		expect(new Uint8Array(await output.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
	});

	it("fails before the request when a referenced local media blob is unavailable", async () => {
		let requested = false;
		const adapter = new LocalMultimediaRenderHttpAdapter(library(null), async () => {
			requested = true;
			return new Response();
		});

		await expect(
			adapter.render({
				document,
				options: {
					format: "webm",
					width: 1920,
					height: 1080,
					fps: 60,
					includeAudio: false,
				},
			}),
		).rejects.toThrow("frame.png is unavailable on this device");
		expect(requested).toBe(false);
	});

	it("does not turn a server error into a downloadable video", async () => {
		const adapter = new LocalMultimediaRenderHttpAdapter(library(new Blob(["img"])), async () =>
			Response.json({ error: "Local render failed" }, { status: 500 }),
		);

		await expect(
			adapter.render({
				document,
				options: {
					format: "mp4",
					width: 1920,
					height: 1080,
					fps: 30,
					includeAudio: true,
				},
			}),
		).rejects.toThrow("Local render failed");
	});
});
