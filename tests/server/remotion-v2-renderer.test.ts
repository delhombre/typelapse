import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type HostedRenderAssetMaterializerPort,
	type RemotionV2RuntimePort,
	createHostedRemotionV2Renderer,
} from "../../server/render/v2/remotion-v2-renderer";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";

const IMAGE_BYTES = Buffer.from("private-image-bytes");
const OUTPUT_BYTES = Buffer.from("rendered-mp4");

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function imageAndTextDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Private image",
			canvas: {
				width: 1920,
				height: 1080,
				background: "url(https://attacker.invalid/background.png)",
			},
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
					fileName: "https://attacker.invalid/persisted.png",
					mimeType: "image/png",
					byteSize: IMAGE_BYTES.byteLength,
					checksum: sha256(IMAGE_BYTES),
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
						{
							id: "title",
							kind: "text",
							text: "Actual V2 text",
							opacity: 1,
							placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
							typography: {
								fontFamily: "Inter",
								fontSize: 64,
								fontWeight: 700,
								color: "#ffffff",
								align: "center",
							},
						},
					],
				},
			],
		},
	};
}

describe("hosted Remotion V2 renderer", () => {
	const temporaryRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			temporaryRoots
				.splice(0)
				.map((temporaryRoot) => rm(temporaryRoot, { recursive: true, force: true })),
		);
	});

	it("renders image and text from owner-scoped private bytes and cleans its workspace", async () => {
		const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "typelapse-v2-test-"));
		temporaryRoots.push(temporaryRoot);
		const materialized: Parameters<
			HostedRenderAssetMaterializerPort["materializePrivateAsset"]
		>[0][] = [];
		const assets: HostedRenderAssetMaterializerPort = {
			async materializePrivateAsset(input) {
				materialized.push(input);
				await writeFile(input.destinationPath, IMAGE_BYTES);
			},
		};
		const bundled: Parameters<RemotionV2RuntimePort["bundle"]>[0][] = [];
		const selected: Parameters<RemotionV2RuntimePort["selectComposition"]>[0][] = [];
		const rendered: Parameters<RemotionV2RuntimePort["renderMedia"]>[0][] = [];
		const runtime: RemotionV2RuntimePort = {
			async bundle(input) {
				bundled.push(input);
				await access(input.entryPoint);
				expect(await readFile(path.join(input.publicDir, "assets/asset-0.png"))).toEqual(
					IMAGE_BYTES,
				);
				return "http://remotion.invalid/job-bundle";
			},
			async selectComposition(input) {
				selected.push(input);
				return { id: "TypelapseV2" };
			},
			async renderMedia(input) {
				rendered.push(input);
				await writeFile(input.outputPath, OUTPUT_BYTES);
			},
		};
		const renderer = createHostedRemotionV2Renderer({
			assets,
			runtime,
			temporaryRoot,
		});

		const artifact = await renderer.render({
			jobId: "job-1",
			ownerId: "owner-1",
			projectId: "project-1",
			revision: 2,
			document: imageAndTextDocument(),
			options: {
				format: "mp4",
				width: 1920,
				height: 1080,
				fps: 30,
				includeAudio: true,
			},
			compilerVersion: "compiler-v2",
			signal: new AbortController().signal,
		});

		expect(materialized).toHaveLength(1);
		expect(materialized[0]).toMatchObject({
			ownerId: "owner-1",
			projectId: "project-1",
			assetId: "image-1",
		});
		expect(materialized[0]?.destinationPath).toMatch(/\/assets\/asset-0\.png$/);
		expect(bundled[0]).toMatchObject({
			publicDir: expect.stringMatching(/\/public$/),
			outDir: expect.stringMatching(/\/bundle$/),
		});
		expect(selected[0]).toMatchObject({
			serveUrl: "http://remotion.invalid/job-bundle",
			compositionId: "TypelapseV2",
		});
		expect(rendered[0]).toMatchObject({
			serveUrl: "http://remotion.invalid/job-bundle",
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 30,
			durationInFrames: 30,
		});
		expect(rendered[0]?.inputProps).toMatchObject({
			input: {
				assetSources: [{ assetId: "image-1", publicPath: "assets/asset-0.png" }],
				// An image and a title make no sound, so the file carries no silent track.
				includeAudio: false,
			},
		});
		expect(rendered[0]?.includeAudio).toBe(false);
		expect(JSON.stringify(rendered[0]?.inputProps)).not.toContain("attacker.invalid");
		expect(artifact).toEqual({
			temporaryId: expect.stringMatching(/\/output\.mp4$/),
			mimeType: "video/mp4",
			byteSize: OUTPUT_BYTES.byteLength,
		});
		expect(artifact.temporaryId.startsWith(temporaryRoot)).toBe(true);

		await renderer.cleanup(artifact);
		await expect(access(path.dirname(artifact.temporaryId))).rejects.toThrow();
	});

	it("renders the loop morph and keeps sound only where the project has some", async () => {
		const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "typelapse-v2-test-"));
		temporaryRoots.push(temporaryRoot);
		const rendered: Parameters<RemotionV2RuntimePort["renderMedia"]>[0][] = [];
		const renderer = createHostedRemotionV2Renderer({
			assets: { materializePrivateAsset: async () => undefined },
			runtime: {
				bundle: async () => "http://remotion.invalid/job-bundle",
				selectComposition: async () => ({ id: "TypelapseV2" }),
				async renderMedia(input) {
					rendered.push(input);
					await writeFile(input.outputPath, OUTPUT_BYTES);
				},
			},
			temporaryRoot,
		});
		const title = imageAndTextDocument().project.scenes[0]?.blocks[1];
		if (!title) {
			throw new Error("fixture lost its title");
		}
		const document: ProjectDocumentV2 = {
			...imageAndTextDocument(),
			project: {
				...imageAndTextDocument().project,
				assets: [],
				scenes: [
					{
						id: "scene-1",
						durationMs: 1_000,
						transitionOut: { kind: "magic-move", durationMs: 650 },
						blocks: [title],
					},
					{ id: "scene-2", durationMs: 1_000, blocks: [{ ...title, id: "title-2" }] },
				],
			},
		};

		const artifact = await renderer.render({
			jobId: "job-loop",
			ownerId: "owner-1",
			projectId: "project-1",
			revision: 1,
			document,
			options: {
				format: "mp4",
				width: 1920,
				height: 1080,
				fps: 30,
				includeAudio: true,
				loop: true,
			},
			compilerVersion: "compiler-v2",
			signal: new AbortController().signal,
		});

		// 1 s + 650 ms morph + 1 s + the 650 ms loop morph back to scene 1, at 30 fps.
		expect(rendered[0]?.durationInFrames).toBe(99);
		expect(rendered[0]?.includeAudio).toBe(false);
		expect(rendered[0]?.inputProps.input).toMatchObject({ loop: true, includeAudio: false });
		await renderer.cleanup(artifact);
	});

	it("aborts the runtime and removes partial private workspaces", async () => {
		const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "typelapse-v2-test-"));
		temporaryRoots.push(temporaryRoot);
		const assets: HostedRenderAssetMaterializerPort = {
			async materializePrivateAsset(input) {
				await writeFile(input.destinationPath, IMAGE_BYTES);
			},
		};
		let started: (() => void) | undefined;
		const runtimeStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const runtime: RemotionV2RuntimePort = {
			bundle: async () => "http://remotion.invalid/job-bundle",
			selectComposition: async () => ({ id: "TypelapseV2" }),
			async renderMedia(input) {
				started?.();
				await new Promise<never>((_resolve, reject) => {
					const aborted = () => reject(input.signal.reason ?? new Error("aborted"));
					if (input.signal.aborted) {
						aborted();
						return;
					}
					input.signal.addEventListener("abort", aborted, { once: true });
				});
			},
		};
		const renderer = createHostedRemotionV2Renderer({ assets, runtime, temporaryRoot });
		const abort = new AbortController();
		const rendering = renderer.render({
			jobId: "job-aborted",
			ownerId: "owner-1",
			projectId: "project-1",
			revision: 2,
			document: imageAndTextDocument(),
			options: {
				format: "mp4",
				width: 1920,
				height: 1080,
				fps: 30,
				includeAudio: true,
			},
			compilerVersion: "compiler-v2",
			signal: abort.signal,
		});
		await runtimeStarted;

		abort.abort(new Error("lease lost"));

		await expect(rendering).rejects.toThrow("lease lost");
		expect(await readdir(temporaryRoot)).toEqual([]);
	});

	it("rejects storage bytes that do not match canonical server metadata", async () => {
		const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "typelapse-v2-test-"));
		temporaryRoots.push(temporaryRoot);
		const assets: HostedRenderAssetMaterializerPort = {
			async materializePrivateAsset(input) {
				await writeFile(input.destinationPath, Buffer.from("substituted-object"));
			},
		};
		let bundled = false;
		const runtime: RemotionV2RuntimePort = {
			bundle: async () => {
				bundled = true;
				return "http://remotion.invalid/job-bundle";
			},
			selectComposition: async () => ({ id: "TypelapseV2" }),
			renderMedia: async () => undefined,
		};
		const renderer = createHostedRemotionV2Renderer({ assets, runtime, temporaryRoot });

		await expect(
			renderer.render({
				jobId: "job-substituted",
				ownerId: "owner-1",
				projectId: "project-1",
				revision: 2,
				document: imageAndTextDocument(),
				options: {
					format: "mp4",
					width: 1920,
					height: 1080,
					fps: 30,
					includeAudio: true,
				},
				compilerVersion: "compiler-v2",
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("unexpected byte size");
		expect(bundled).toBe(false);
		expect(await readdir(temporaryRoot)).toEqual([]);
	});

	it("never resolves private assets across a mismatched project boundary", async () => {
		const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "typelapse-v2-test-"));
		temporaryRoots.push(temporaryRoot);
		let materialized = false;
		const assets: HostedRenderAssetMaterializerPort = {
			async materializePrivateAsset() {
				materialized = true;
				throw new Error("asset materializer must not be reached");
			},
		};
		const runtime: RemotionV2RuntimePort = {
			bundle: async () => "http://remotion.invalid/job-bundle",
			selectComposition: async () => ({ id: "TypelapseV2" }),
			renderMedia: async () => undefined,
		};
		const renderer = createHostedRemotionV2Renderer({ assets, runtime, temporaryRoot });

		await expect(
			renderer.render({
				jobId: "job-cross-project",
				ownerId: "owner-1",
				projectId: "project-foreign",
				revision: 2,
				document: imageAndTextDocument(),
				options: {
					format: "mp4",
					width: 1920,
					height: 1080,
					fps: 30,
					includeAudio: true,
				},
				compilerVersion: "compiler-v2",
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("project identity");
		expect(materialized).toBe(false);
		expect(await readdir(temporaryRoot)).toEqual([]);
	});
});
