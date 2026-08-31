import {
	createHostedProjectSeed,
	remapHostedProjectAssets,
} from "@/application/project/publish-local-project";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { describe, expect, it } from "vitest";

describe("publishing a local project", () => {
	it("creates a valid asset-free seed without mutating the local story", () => {
		const local = createStarterMultimediaProject({
			projectId: "local-project",
			sceneId: "scene-1",
			textBlockId: "title-1",
		});
		const sourceScene = local.project.scenes[0];
		if (!sourceScene) {
			throw new Error("Starter project must contain one scene");
		}
		const mediaOnly = {
			...local,
			project: {
				...local.project,
				assets: [
					{
						id: "image-local",
						kind: "image" as const,
						fileName: "cover.png",
						mimeType: "image/png",
						byteSize: 128,
						checksum: "a".repeat(64),
						width: 1200,
						height: 800,
					},
				],
				scenes: [
					{
						...sourceScene,
						blocks: [
							{
								id: "image-block",
								kind: "image" as const,
								opacity: 1,
								placement: { x: 0, y: 0, width: 1, height: 1 },
								assetId: "image-local",
								fit: "cover" as const,
								focalPoint: { x: 0.5, y: 0.5 },
							},
						],
					},
				],
			},
		};

		const seed = createHostedProjectSeed(mediaOnly);

		expect(seed.project.id).toBe("local-project");
		expect(seed.project.assets).toEqual([]);
		expect(seed.project.audioCues).toEqual([]);
		expect(seed.project.scenes.flatMap((scene) => scene.blocks)).toEqual([
			expect.objectContaining({ kind: "text", text: "Preparing your private project…" }),
		]);
		expect(mediaOnly.project.assets).toHaveLength(1);
		expect(mediaOnly.project.scenes[0]?.blocks[0]).toMatchObject({ assetId: "image-local" });
	});

	it("rebuilds the exact mixed-media story with server-owned asset ids", () => {
		const starter = createStarterMultimediaProject({
			projectId: "local-project",
			sceneId: "scene-1",
			textBlockId: "title-1",
		});
		const sourceScene = starter.project.scenes[0];
		if (!sourceScene) {
			throw new Error("Starter project must contain one scene");
		}
		const local = {
			...starter,
			project: {
				...starter.project,
				assets: [
					{
						id: "image-local",
						kind: "image" as const,
						fileName: "cover.png",
						mimeType: "image/png",
						byteSize: 128,
						checksum: "a".repeat(64),
						width: 1200,
						height: 800,
					},
					{
						id: "audio-local",
						kind: "audio" as const,
						fileName: "voice.mp3",
						mimeType: "audio/mpeg",
						byteSize: 256,
						checksum: "b".repeat(64),
						durationMs: 4_000,
					},
				],
				audioCues: [
					{
						id: "voice-cue",
						assetId: "audio-local",
						startMs: 0,
						trim: { startMs: 0, endMs: 3_000 },
						gain: 1,
						fadeInMs: 0,
						fadeOutMs: 0,
					},
				],
				scenes: [
					{
						...sourceScene,
						blocks: [
							...sourceScene.blocks,
							{
								id: "image-block",
								kind: "image" as const,
								opacity: 1,
								placement: { x: 0, y: 0, width: 1, height: 1 },
								assetId: "image-local",
								fit: "cover" as const,
								focalPoint: { x: 0.5, y: 0.5 },
							},
						],
					},
				],
			},
		};
		const [imageAsset, audioAsset] = local.project.assets;
		if (!imageAsset || !audioAsset) {
			throw new Error("Mixed-media fixture must contain image and audio assets");
		}

		const hosted = remapHostedProjectAssets(local, {
			projectId: "project_hosted",
			assets: [
				{
					localAssetId: "image-local",
					hostedAsset: { ...imageAsset, id: "asset_image_hosted" },
				},
				{
					localAssetId: "audio-local",
					hostedAsset: { ...audioAsset, id: "asset_audio_hosted" },
				},
			],
		});

		expect(hosted.project.id).toBe("project_hosted");
		expect(hosted.project.assets.map((asset) => asset.id)).toEqual([
			"asset_image_hosted",
			"asset_audio_hosted",
		]);
		expect(hosted.project.scenes[0]?.blocks.at(-1)).toMatchObject({
			kind: "image",
			assetId: "asset_image_hosted",
		});
		expect(hosted.project.audioCues[0]).toMatchObject({ assetId: "asset_audio_hosted" });
	});

	it("refuses an incomplete upload map instead of saving broken references", () => {
		const local = createStarterMultimediaProject();
		const withAsset = {
			...local,
			project: {
				...local.project,
				assets: [
					{
						id: "image-local",
						kind: "image" as const,
						fileName: "cover.png",
						mimeType: "image/png",
						byteSize: 128,
						checksum: "a".repeat(64),
						width: 1200,
						height: 800,
					},
				],
			},
		};

		expect(() => remapHostedProjectAssets(withAsset, { projectId: "hosted", assets: [] })).toThrow(
			"Every local media asset must be uploaded before cloud save",
		);
	});
});
