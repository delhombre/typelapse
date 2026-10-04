import { Asset } from "@/domain/entities/asset";
import { AudioCue } from "@/domain/entities/audio-cue";
import { CodeBlock, ImageBlock, TextBlock, VideoBlock } from "@/domain/entities/block";
import { Project } from "@/domain/entities/project";
import { Scene } from "@/domain/entities/scene";
import { describe, expect, it } from "vitest";

const CANVAS = { width: 1920, height: 1080, background: "mesh:solar" } as const;

function imageAsset(id = "asset-image") {
	return Asset.create({
		id,
		kind: "image",
		fileName: "hero.png",
		mimeType: "image/png",
		byteSize: 42_000,
		checksum: "sha256:image",
		width: 1600,
		height: 900,
	});
}

function videoAsset(id = "asset-video") {
	return Asset.create({
		id,
		kind: "video",
		fileName: "demo.mp4",
		mimeType: "video/mp4",
		byteSize: 8_000_000,
		checksum: "sha256:video",
		width: 1920,
		height: 1080,
		durationMs: 5_000,
	});
}

function audioAsset(id = "asset-audio") {
	return Asset.create({
		id,
		kind: "audio",
		fileName: "voiceover.wav",
		mimeType: "audio/wav",
		byteSize: 960_000,
		checksum: "sha256:audio",
		durationMs: 5_000,
	});
}

function audioCue(
	assetId = "asset-audio",
	id = "cue-audio",
	overrides?: { startMs?: number; trimEndMs?: number },
) {
	return AudioCue.create({
		id,
		assetId,
		startMs: overrides?.startMs ?? 0,
		trim: { startMs: 0, endMs: overrides?.trimEndMs ?? 2_000 },
		gain: 0.8,
		fadeInMs: 100,
		fadeOutMs: 100,
	});
}

function codeScene(sceneId = "scene-code", blockId = "block-code", code = "const x = 1;") {
	return Scene.create({
		id: sceneId,
		durationMs: 1_000,
		blocks: [
			CodeBlock.create({
				id: blockId,
				code,
				language: "typescript",
				continuityKey: "primary-code",
			}),
		],
	});
}

function textScene(sceneId = "scene-text", blockId = "block-text") {
	return Scene.create({
		id: sceneId,
		durationMs: 1_000,
		blocks: [
			TextBlock.create({
				id: blockId,
				text: "An authored title",
				typography: {
					fontFamily: "Inter",
					fontSize: 48,
					fontWeight: 600,
					color: "#fff",
					align: "center",
				},
			}),
		],
	});
}

function imageScene(assetId = "asset-image", sceneId = "scene-image", blockId = "block-image") {
	return Scene.create({
		id: sceneId,
		durationMs: 1_000,
		blocks: [ImageBlock.create({ id: blockId, assetId })],
	});
}

function videoScene(assetId = "asset-video", sceneId = "scene-video", blockId = "block-video") {
	return Scene.create({
		id: sceneId,
		durationMs: 1_000,
		blocks: [
			VideoBlock.create({
				id: blockId,
				assetId,
				trim: { startMs: 100, endMs: 4_000 },
			}),
		],
	});
}

describe("Project", () => {
	it("hydrates a scene-first project with canvas, assets and stable ids", () => {
		const image = imageAsset();
		const scene = imageScene();
		const project = Project.create({
			id: "project-1",
			title: "Launch story",
			canvas: CANVAS,
			assets: [image],
			scenes: [scene],
		});

		expect(project.id).toBe("project-1");
		expect(project.title).toBe("Launch story");
		expect(project.canvas).toEqual(CANVAS);
		expect(project.assets).toEqual([image]);
		expect(project.scenes).toEqual([scene]);
		expect(project.audioCues).toEqual([]);
		expect(project.durationMs).toBe(1_000);
	});

	it("rejects invalid project identity, canvas and a content-empty timeline", () => {
		expect(() => Project.create({ title: " ", canvas: CANVAS, scenes: [codeScene()] })).toThrow(
			"Project title must not be empty",
		);
		expect(() =>
			Project.create({
				title: "Project",
				canvas: { ...CANVAS, width: 0 },
				scenes: [codeScene()],
			}),
		).toThrow("Project canvas dimensions must be supported integers");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: { ...CANVAS, background: " " },
				scenes: [codeScene()],
			}),
		).toThrow("Project canvas background must not be empty");
		expect(() => Project.create({ title: "Project", canvas: CANVAS, scenes: [] })).toThrow(
			"Project must contain a visual block or an audio cue",
		);
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				scenes: [Scene.create({ durationMs: 1_000, blocks: [] })],
			}),
		).toThrow("Project must contain a visual block or an audio cue");
	});

	it("supports an audio-only project and derives its canonical duration", () => {
		const asset = audioAsset();
		const cue = audioCue("asset-audio", "cue-voice", { startMs: 750, trimEndMs: 2_250 });
		const project = Project.create({
			title: "Audio story",
			canvas: CANVAS,
			assets: [asset],
			audioCues: [cue],
			scenes: [],
		});

		expect(project.scenes).toEqual([]);
		expect(project.audioCues).toEqual([cue]);
		expect(project.durationMs).toBe(3_000);
	});

	it("accepts code, text, image or video as the only visual medium", () => {
		const projects = [
			Project.create({ title: "Code", canvas: CANVAS, scenes: [codeScene()] }),
			Project.create({ title: "Text", canvas: CANVAS, scenes: [textScene()] }),
			Project.create({
				title: "Image",
				canvas: CANVAS,
				assets: [imageAsset()],
				scenes: [imageScene()],
			}),
			Project.create({
				title: "Video",
				canvas: CANVAS,
				assets: [videoAsset()],
				scenes: [videoScene()],
			}),
		];

		expect(projects.map((project) => project.scenes[0]?.blocks[0]?.kind)).toEqual([
			"code",
			"text",
			"image",
			"video",
		]);
	});

	it("uses the furthest visual or audio end as mixed-project duration", () => {
		const firstScene = Scene.create({
			id: "scene-1",
			durationMs: 1_000,
			blocks: [CodeBlock.create({ id: "code-1", code: "a", language: "text" })],
			transitionOut: { kind: "crossfade", durationMs: 400 },
		});
		const secondScene = codeScene("scene-2", "code-2");
		const visualWins = Project.create({
			title: "Mixed",
			canvas: CANVAS,
			assets: [audioAsset()],
			audioCues: [audioCue("asset-audio", "cue-short", { trimEndMs: 500 })],
			scenes: [firstScene, secondScene],
		});
		const audioWins = Project.create({
			title: "Mixed",
			canvas: CANVAS,
			assets: [audioAsset()],
			audioCues: [audioCue("asset-audio", "cue-long", { startMs: 1_000, trimEndMs: 4_000 })],
			scenes: [firstScene, secondScene],
		});

		expect(visualWins.durationMs).toBe(2_400);
		expect(audioWins.durationMs).toBe(5_000);
	});

	it("enforces globally unique asset, scene and block ids", () => {
		const firstImage = imageAsset("same-asset");
		const secondImage = imageAsset("same-asset");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				assets: [firstImage, secondImage],
				scenes: [codeScene()],
			}),
		).toThrow("Project entity ids must be globally unique: same-asset");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				scenes: [codeScene("scene-1", "same-block"), codeScene("scene-2", "same-block")],
			}),
		).toThrow("Project entity ids must be globally unique: same-block");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				scenes: [codeScene("same-scene"), codeScene("same-scene", "other-block")],
			}),
		).toThrow("Project entity ids must be globally unique: same-scene");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				assets: [audioAsset()],
				audioCues: [audioCue("asset-audio", "scene-code")],
				scenes: [codeScene()],
			}),
		).toThrow("Project entity ids must be globally unique: scene-code");
	});

	it("validates image and video references and media kind", () => {
		expect(() =>
			Project.create({ title: "Project", canvas: CANVAS, scenes: [imageScene("missing")] }),
		).toThrow("Block 'block-image' references missing asset 'missing'");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				assets: [videoAsset("asset-image")],
				scenes: [imageScene()],
			}),
		).toThrow("Image block 'block-image' must reference an image asset");
		expect(() =>
			Project.create({
				title: "Project",
				canvas: CANVAS,
				assets: [
					Asset.create({
						id: "asset-video",
						kind: "video",
						fileName: "short.mp4",
						mimeType: "video/mp4",
						byteSize: 1,
						checksum: "sha256:short",
						width: 10,
						height: 10,
						durationMs: 2_000,
					}),
				],
				scenes: [videoScene()],
			}),
		).toThrow("Video block 'block-video' trim exceeds asset duration");
	});

	it("validates audio cue ownership, kind and trim against registered assets", () => {
		expect(() =>
			Project.create({
				title: "Audio",
				canvas: CANVAS,
				audioCues: [audioCue("missing")],
				scenes: [],
			}),
		).toThrow("Audio cue 'cue-audio' references missing asset 'missing'");
		expect(() =>
			Project.create({
				title: "Audio",
				canvas: CANVAS,
				assets: [imageAsset("asset-audio")],
				audioCues: [audioCue()],
				scenes: [],
			}),
		).toThrow("Audio cue 'cue-audio' must reference an audio asset");
		expect(() =>
			Project.create({
				title: "Audio",
				canvas: CANVAS,
				assets: [audioAsset()],
				audioCues: [audioCue("asset-audio", "cue-audio", { trimEndMs: 6_000 })],
				scenes: [],
			}),
		).toThrow("Audio cue 'cue-audio' trim exceeds asset duration");
	});

	it("registers an asset immutably and refuses an id collision", () => {
		const project = Project.create({ title: "Project", canvas: CANVAS, scenes: [codeScene()] });
		const image = imageAsset();

		const updated = project.registerAsset(image);

		expect(updated).not.toBe(project);
		expect(project.assets).toEqual([]);
		expect(updated.assets).toEqual([image]);
		expect(() => updated.registerAsset(imageAsset())).toThrow(
			"Project entity ids must be globally unique: asset-image",
		);
	});

	it("adds only scenes whose ids and asset references are valid", () => {
		const image = imageAsset();
		const project = Project.create({
			title: "Project",
			canvas: CANVAS,
			assets: [image],
			scenes: [codeScene()],
		});

		const updated = project.addScene(imageScene());

		expect(updated).not.toBe(project);
		expect(updated.scenes.map((scene) => scene.id)).toEqual(["scene-code", "scene-image"]);
		expect(project.scenes).toHaveLength(1);
		expect(() => project.addScene(imageScene("missing"))).toThrow(
			"Block 'block-image' references missing asset 'missing'",
		);
	});

	it("inserts, replaces and removes authored scenes without code-specific assumptions", () => {
		const project = Project.create({
			title: "Mixed story",
			canvas: CANVAS,
			scenes: [codeScene("scene-code", "block-code")],
		});
		const title = textScene("scene-title", "block-title");
		const outro = textScene("scene-outro", "block-outro");

		const inserted = project.addScene(outro).addScene(title, 0);
		const replacement = Scene.create({
			id: "scene-code",
			durationMs: 2_000,
			blocks: [
				TextBlock.create({
					id: "block-code",
					text: "Code is optional",
					typography: {
						fontFamily: "Inter",
						fontSize: 52,
						fontWeight: 650,
						color: "#fff",
						align: "center",
					},
				}),
			],
		});
		const replaced = inserted.replaceScene(replacement);
		const removed = replaced.removeScene("scene-code");

		expect(inserted.scenes.map((scene) => scene.id)).toEqual([
			"scene-title",
			"scene-code",
			"scene-outro",
		]);
		expect(replaced.scenes[1]).toBe(replacement);
		expect(removed.scenes.map((scene) => scene.id)).toEqual(["scene-title", "scene-outro"]);
		expect(project.scenes[0]?.blocks[0]?.kind).toBe("code");
		expect(() => project.addScene(title, 2)).toThrow("Scene insertion index is out of bounds");
		expect(() => project.replaceScene(title)).toThrow("does not belong to project");
		expect(() => project.removeScene("missing")).toThrow("does not belong to project");
		expect(() => project.removeScene("scene-code")).toThrow(
			"Project must contain a visual block or an audio cue",
		);
	});

	it("adds an audio cue immutably through the aggregate", () => {
		const project = Project.create({
			title: "Mixed",
			canvas: CANVAS,
			assets: [audioAsset()],
			scenes: [codeScene()],
		});
		const cue = audioCue();

		const updated = project.addAudioCue(cue);

		expect(updated).not.toBe(project);
		expect(project.audioCues).toEqual([]);
		expect(updated.audioCues).toEqual([cue]);
		expect(() => project.addAudioCue(audioCue("missing"))).toThrow(
			"Audio cue 'cue-audio' references missing asset 'missing'",
		);
	});

	it("reorders scenes only from an exact permutation", () => {
		const project = Project.create({
			title: "Project",
			canvas: CANVAS,
			scenes: [codeScene("scene-1", "block-1"), codeScene("scene-2", "block-2")],
		});

		const reordered = project.reorderScenes(["scene-2", "scene-1"]);

		expect(reordered.scenes.map((scene) => scene.id)).toEqual(["scene-2", "scene-1"]);
		expect(project.scenes.map((scene) => scene.id)).toEqual(["scene-1", "scene-2"]);
		expect(() => project.reorderScenes(["scene-1", "scene-1"])).toThrow(
			"Ordered scene ids must be an exact permutation",
		);
		expect(() => project.reorderScenes(["scene-1", "missing"])).toThrow(
			"Ordered scene ids must be an exact permutation",
		);
	});

	it("replaces a block by stable id and revalidates its asset reference", () => {
		const project = Project.create({
			title: "Project",
			canvas: CANVAS,
			assets: [imageAsset()],
			scenes: [codeScene()],
		});
		const replacement = TextBlock.create({
			id: "block-code",
			text: "Now with words",
			typography: {
				fontFamily: "Inter",
				fontSize: 48,
				fontWeight: 600,
				color: "#fff",
				align: "center",
			},
		});

		const updated = project.replaceBlock("scene-code", replacement);

		expect(updated.scenes[0]?.blocks[0]).toBe(replacement);
		expect(project.scenes[0]?.blocks[0]?.kind).toBe("code");
		expect(() =>
			project.replaceBlock(
				"scene-code",
				ImageBlock.create({ id: "block-code", assetId: "missing" }),
			),
		).toThrow("Block 'block-code' references missing asset 'missing'");
		expect(() => project.replaceBlock("missing-scene", replacement)).toThrow(
			"Scene missing-scene does not belong to project",
		);
	});

	it("authors a mixed layer stack through the project aggregate", () => {
		const project = Project.create({ title: "Layers", canvas: CANVAS, scenes: [codeScene()] });
		const title = TextBlock.create({
			id: "block-title",
			text: "Mixed media",
			typography: {
				fontFamily: "Inter",
				fontSize: 48,
				fontWeight: 650,
				color: "#fff",
				align: "center",
			},
		});

		const layered = project.addBlock("scene-code", title, 0);
		const reordered = layered.reorderBlocks("scene-code", ["block-code", "block-title"]);
		const removed = reordered.removeBlock("scene-code", "block-code");

		expect(layered.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"block-title",
			"block-code",
		]);
		expect(reordered.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"block-code",
			"block-title",
		]);
		expect(removed.scenes[0]?.blocks.map((block) => block.id)).toEqual(["block-title"]);
		expect(() => project.addBlock("missing", title)).toThrow("does not belong to project");
	});

	it("replaces and removes global audio cues while protecting the last project content", () => {
		const project = Project.create({
			title: "Sound design",
			canvas: CANVAS,
			assets: [audioAsset()],
			audioCues: [audioCue()],
			scenes: [],
		});
		const replacement = AudioCue.create({
			id: "cue-audio",
			assetId: "asset-audio",
			startMs: 500,
			trim: { startMs: 250, endMs: 2_250 },
			gain: 0.5,
			fadeInMs: 200,
			fadeOutMs: 200,
		});

		const updated = project.replaceAudioCue(replacement);

		expect(updated.audioCues[0]).toBe(replacement);
		expect(updated.durationMs).toBe(2_500);
		expect(project.audioCues[0]?.startMs).toBe(0);
		expect(() => project.removeAudioCue("cue-audio")).toThrow(
			"Project must contain a visual block or an audio cue",
		);
		expect(() => project.replaceAudioCue(audioCue("asset-audio", "missing"))).toThrow(
			"does not belong to project",
		);
	});

	it("updates project identity and canvas through validated immutable operations", () => {
		const project = Project.create({ title: "Draft", canvas: CANVAS, scenes: [codeScene()] });

		const updated = project
			.rename("  Product film  ")
			.updateCanvas({ width: 1080, height: 1920, background: "mesh:aurora" });

		expect(updated.title).toBe("Product film");
		expect(updated.canvas).toEqual({ width: 1080, height: 1920, background: "mesh:aurora" });
		expect(project.title).toBe("Draft");
		expect(project.canvas).toEqual(CANVAS);
		expect(() => project.rename(" ")).toThrow("Project title must not be empty");
	});

	it("removes an unused asset but protects referenced media", () => {
		const project = Project.create({
			title: "Project",
			canvas: CANVAS,
			assets: [imageAsset(), audioAsset()],
			scenes: [imageScene()],
		});

		const updated = project.removeUnusedAsset("asset-audio");

		expect(updated.assets.map((asset) => asset.id)).toEqual(["asset-image"]);
		expect(project.assets).toHaveLength(2);
		expect(() => project.removeUnusedAsset("asset-image")).toThrow(
			"Asset asset-image is still referenced by a block",
		);
		expect(() => project.removeUnusedAsset("missing")).toThrow(
			"Asset missing does not belong to project",
		);
	});

	it("protects an audio asset referenced by a cue", () => {
		const project = Project.create({
			title: "Audio",
			canvas: CANVAS,
			assets: [audioAsset()],
			audioCues: [audioCue()],
			scenes: [],
		});

		expect(() => project.removeUnusedAsset("asset-audio")).toThrow(
			"Asset asset-audio is still referenced by an audio cue",
		);
	});

	it("defensively freezes canvas and collection snapshots", () => {
		const assets = [imageAsset()];
		const scenes = [imageScene()];
		const canvas: { width: number; height: number; background: string } = { ...CANVAS };
		const project = Project.create({ title: "Project", canvas, assets, scenes });

		assets.push(audioAsset());
		scenes.push(codeScene());
		canvas.background = "changed";

		expect(project.assets).toHaveLength(1);
		expect(project.scenes).toHaveLength(1);
		expect(project.canvas.background).toBe("mesh:solar");
		expect(Object.isFrozen(project)).toBe(true);
		expect(Object.isFrozen(project.canvas)).toBe(true);
		expect(Object.isFrozen(project.assets)).toBe(true);
		expect(Object.isFrozen(project.scenes)).toBe(true);
		expect(Object.isFrozen(project.audioCues)).toBe(true);
	});
});
