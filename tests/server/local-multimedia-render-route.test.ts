// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalMultimediaRenderRoute } from "../../server/routes/local-multimedia-render";
import type { HostedMultimediaRendererPort } from "../../src/application/render/process-hosted-render-job";

/** A real 1x1 PNG: the route sniffs content, so a text stand-in is no longer an image. */
const IMAGE_BYTES = new Uint8Array(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"base64",
	),
);
const VIDEO_BYTES = new TextEncoder().encode("rendered-local-video");

function checksum(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function document() {
	return {
		schemaVersion: 2,
		project: {
			id: "project-local",
			title: "Local story",
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
					byteSize: IMAGE_BYTES.byteLength,
					checksum: checksum(IMAGE_BYTES),
					width: 1600,
					height: 900,
				},
			],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1_000,
					blocks: [
						{
							id: "image-block",
							kind: "image",
							assetId: "image-1",
							fit: "cover",
							focalPoint: { x: 0.5, y: 0.5 },
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
						},
					],
				},
			],
		},
	} as const;
}

function multipart(input: {
	readonly bytes?: Uint8Array;
	readonly checksumOverride?: string;
} = {}): FormData {
	const bytes = input.bytes ?? IMAGE_BYTES;
	const payload = structuredClone(document()) as ReturnType<typeof document>;
	if (input.checksumOverride) {
		(payload.project.assets[0] as { checksum: string }).checksum = input.checksumOverride;
	}
	const form = new FormData();
	form.set("document", JSON.stringify(payload));
	form.set(
		"options",
		JSON.stringify({
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 30,
			includeAudio: true,
		}),
	);
	const fileBytes = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	form.set("asset:image-1", new File([fileBytes], "frame.png", { type: "image/png" }));
	return form;
}

describe("local multimedia render route", () => {
	const temporaryDirectories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("renders an authenticated-free local V2 request from canonical document and exact media bytes", async () => {
		const materialized: Uint8Array[] = [];
		const route = createLocalMultimediaRenderRoute({
			createRenderer: (assets) => {
				const renderer: HostedMultimediaRendererPort = {
					async render(input) {
						const directory = await mkdtemp(path.join(os.tmpdir(), "typelapse-local-route-"));
						temporaryDirectories.push(directory);
						const localAsset = await assets.bytesFor("image-1");
						materialized.push(localAsset);
						const output = path.join(directory, "output.mp4");
						await writeFile(output, VIDEO_BYTES);
						expect(input.document.project.id).toBe("project-local");
						expect(input.options.includeAudio).toBe(true);
						return {
							temporaryId: output,
							mimeType: "video/mp4",
							byteSize: VIDEO_BYTES.byteLength,
						};
					},
					async cleanup(artifact) {
						await rm(path.dirname(artifact.temporaryId), { recursive: true, force: true });
					},
				};
				return renderer;
			},
		});

		const response = await route.request("http://localhost/render/v2", {
			method: "POST",
			body: multipart(),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-disposition")).toContain("Local-story.mp4");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(VIDEO_BYTES);
		expect(materialized).toEqual([IMAGE_BYTES]);
	});

	it("rejects media whose bytes do not match the canonical metadata before starting Remotion", async () => {
		let created = 0;
		const route = createLocalMultimediaRenderRoute({
			createRenderer: () => {
				created += 1;
				throw new Error("must not start");
			},
		});

		const response = await route.request("http://localhost/render/v2", {
			method: "POST",
			body: multipart({ bytes: new TextEncoder().encode("tampered") }),
		});

		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({
			error: "Media bytes do not match the project metadata",
			assetId: "image-1",
		});
		expect(created).toBe(0);
	});

	it("refuses a PDF declared as a PNG with a 415 before starting Remotion", async () => {
		let created = 0;
		const route = createLocalMultimediaRenderRoute({
			createRenderer: () => {
				created += 1;
				throw new Error("must not start");
			},
		});
		// Metadata that describes the PDF exactly, so only the content sniff can catch it.
		const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
		const form = multipart({ bytes: pdf });
		const payload = JSON.parse(form.get("document") as string);
		payload.project.assets[0].byteSize = pdf.byteLength;
		payload.project.assets[0].checksum = checksum(pdf);
		form.set("document", JSON.stringify(payload));

		const response = await route.request("http://localhost/render/v2", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(415);
		expect(await response.json()).toEqual({
			error: "Media content does not match its declared type",
			assetId: "image-1",
		});
		expect(created).toBe(0);
	});

	it("names a media part sent twice instead of calling it missing", async () => {
		const form = multipart();
		form.append("asset:image-1", form.get("asset:image-1") as File);
		const route = createLocalMultimediaRenderRoute({
			createRenderer: () => {
				throw new Error("must not start");
			},
		});

		const response = await route.request("http://localhost/render/v2", {
			method: "POST",
			body: form,
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Project media is sent more than once",
			assetId: "image-1",
		});
	});

	it("does not leak renderer failures or leave a successful-looking video response", async () => {
		const route = createLocalMultimediaRenderRoute({
			createRenderer: () => ({
				async render() {
					throw new Error("SECRET_LOCAL_PATH=/private/media.mov");
				},
				async cleanup() {},
			}),
		});

		const response = await route.request("http://localhost/render/v2", {
			method: "POST",
			body: multipart(),
		});

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Local render failed" });
	});
});
