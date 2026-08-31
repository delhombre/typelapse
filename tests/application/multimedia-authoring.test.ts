import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import {
	addCodeLayer,
	addEmptyScene,
	addMediaAsset,
	addTextLayer,
	placeRegisteredMediaAsset,
	reorderLayer,
	updateCodeLayer,
	updateLayerPlacement,
	updateMediaLayer,
	updateTextLayer,
} from "@/application/project/multimedia-authoring";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { Asset } from "@/domain/entities/asset";
import { describe, expect, it } from "vitest";

function project() {
	return hydrateProjectDocument(
		createStarterMultimediaProject({
			projectId: "project-1",
			sceneId: "scene-1",
			textBlockId: "starter-text",
		}),
	).project;
}

describe("multimedia authoring", () => {
	it("adds text, code and empty scenes without a code-first assumption", () => {
		const withText = addTextLayer(project(), "scene-1", {
			id: "subtitle",
			text: "Text is a first-class layer",
		});
		const withCode = addCodeLayer(withText, "scene-1", {
			id: "code",
			code: "const media = ['text', 'image', 'video', 'audio'];",
			language: "typescript",
		});
		const withScene = addEmptyScene(withCode, { id: "scene-2", durationMs: 2_400 });

		expect(withScene.scenes[0]?.blocks.map((block) => block.kind)).toEqual([
			"text",
			"text",
			"code",
		]);
		expect(withScene.scenes[1]).toMatchObject({ id: "scene-2", durationMs: 2_400, blocks: [] });
	});

	it("registers an image or video once and adds a matching visual layer", () => {
		const image = Asset.create({
			id: "image-1",
			kind: "image",
			fileName: "still.jpg",
			mimeType: "image/jpeg",
			byteSize: 1_024,
			checksum: "sha256:image",
			width: 1_200,
			height: 800,
		});

		const result = addMediaAsset(project(), "scene-1", image, { blockId: "image-block" });

		expect(result.assets.map((asset) => asset.id)).toEqual(["image-1"]);
		expect(result.scenes[0]?.blocks.find((block) => block.id === "image-block")).toMatchObject({
			id: "image-block",
			kind: "image",
			assetId: "image-1",
		});
		expect(() => addMediaAsset(result, "scene-1", image)).toThrow(
			"Asset image-1 is already registered",
		);
	});

	it("places imported visual media behind existing text and code overlays by default", () => {
		const withCode = addCodeLayer(project(), "scene-1", {
			id: "code-overlay",
			code: "const overlay = true;",
		});
		const image = Asset.create({
			id: "background-image",
			kind: "image",
			fileName: "background.jpg",
			mimeType: "image/jpeg",
			byteSize: 1_024,
			checksum: "sha256:background",
			width: 1_200,
			height: 800,
		});

		const result = addMediaAsset(withCode, "scene-1", image, { blockId: "background" });

		expect(result.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"background",
			"starter-text",
			"code-overlay",
		]);
	});

	it("places an already registered hosted asset without registering it twice", () => {
		const image = Asset.create({
			id: "hosted-image-1",
			kind: "image",
			fileName: "hosted-still.jpg",
			mimeType: "image/jpeg",
			byteSize: 1_024,
			checksum: "sha256:hosted-image",
			width: 1_200,
			height: 800,
		});
		const canonical = project().registerAsset(image);

		const result = placeRegisteredMediaAsset(canonical, "scene-1", image.id, {
			blockId: "hosted-image-block",
		});

		expect(result.assets.map((asset) => asset.id)).toEqual(["hosted-image-1"]);
		expect(
			result.scenes[0]?.blocks.find((block) => block.id === "hosted-image-block"),
		).toMatchObject({
			id: "hosted-image-block",
			kind: "image",
			assetId: "hosted-image-1",
		});
	});

	it("registers audio on its own rail without inventing a visual block", () => {
		const audio = Asset.create({
			id: "audio-1",
			kind: "audio",
			fileName: "voiceover.m4a",
			mimeType: "audio/mp4",
			byteSize: 2_048,
			checksum: "sha256:audio",
			durationMs: 4_000,
		});

		const result = addMediaAsset(project(), "scene-1", audio, {
			cueId: "voiceover",
			startMs: 250,
		});

		expect(result.audioCues[0]).toMatchObject({
			id: "voiceover",
			assetId: "audio-1",
			startMs: 250,
			trim: { startMs: 0, endMs: 4_000 },
		});
		expect(result.scenes[0]?.blocks).toHaveLength(1);
	});

	it("edits each layer kind without losing its identity, placement or untouched settings", () => {
		const withCode = addCodeLayer(project(), "scene-1", {
			id: "code-1",
			code: "const first = true;",
			language: "typescript",
		});
		const image = Asset.create({
			id: "image-1",
			kind: "image",
			fileName: "still.jpg",
			mimeType: "image/jpeg",
			byteSize: 1_024,
			checksum: "sha256:image",
			width: 1_200,
			height: 800,
		});
		const withImage = addMediaAsset(withCode, "scene-1", image, {
			blockId: "image-block",
			placement: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
		});

		const withTextEdit = updateTextLayer(withImage, "scene-1", "starter-text", {
			text: "A story, not a diff",
			fontSize: 96,
			align: "left",
		});
		const withCodeEdit = updateCodeLayer(withTextEdit, "scene-1", "code-1", {
			code: "const media = ['text', 'image', 'video'];",
			language: "javascript",
			showLineNumbers: false,
		});
		const result = updateMediaLayer(withCodeEdit, "scene-1", "image-block", {
			fit: "contain",
			opacity: 0.72,
		});

		expect(result.scenes[0]?.blocks.find((block) => block.id === "starter-text")).toMatchObject({
			id: "starter-text",
			text: "A story, not a diff",
			typography: { fontSize: 96, align: "left" },
		});
		expect(result.scenes[0]?.blocks.find((block) => block.id === "code-1")).toMatchObject({
			id: "code-1",
			code: "const media = ['text', 'image', 'video'];",
			language: "javascript",
			showLineNumbers: false,
		});
		expect(result.scenes[0]?.blocks.find((block) => block.id === "image-block")).toMatchObject({
			id: "image-block",
			fit: "contain",
			opacity: 0.72,
			placement: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
		});
	});

	it("rejects an inspector edit when the selected layer kind does not match", () => {
		expect(() => updateCodeLayer(project(), "scene-1", "starter-text", { code: "nope" })).toThrow(
			"is not a code layer",
		);
	});

	it("patches placement through the immutable project and clamps it inside the canvas", () => {
		const original = project();
		const originalPlacement = { ...original.scenes[0]?.blocks[0]?.placement };

		const result = updateLayerPlacement(original, "scene-1", "starter-text", {
			x: 0.9,
			y: -0.2,
			width: 0.4,
			height: 2,
		});

		expect(result).not.toBe(original);
		expect(original.scenes[0]?.blocks[0]?.placement).toEqual(originalPlacement);
		expect(result.scenes[0]?.blocks[0]?.placement).toEqual({
			x: 0.6,
			y: 0,
			width: 0.4,
			height: 1,
		});
		expect(() =>
			updateLayerPlacement(original, "scene-1", "starter-text", { x: Number.NaN }),
		).toThrow("Layer placement values must be finite");
	});

	it("edits focal point, radius and bounded video timing without losing media settings", () => {
		const video = Asset.create({
			id: "video-1",
			kind: "video",
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			byteSize: 4_096,
			checksum: "sha256:video",
			width: 1_920,
			height: 1_080,
			durationMs: 4_000,
		});
		const withVideo = addMediaAsset(project(), "scene-1", video, { blockId: "video-block" });

		const result = updateMediaLayer(withVideo, "scene-1", "video-block", {
			fit: "contain",
			focalPoint: { x: 1.4, y: -0.3 },
			borderRadius: 400,
			trimStartMs: -500,
			trimEndMs: 9_000,
			playbackRate: 8,
			muted: false,
		});

		expect(result.scenes[0]?.blocks[0]).toMatchObject({
			id: "video-block",
			fit: "contain",
			focalPoint: { x: 1, y: 0 },
			borderRadius: 160,
			trim: { startMs: 0, endMs: 4_000 },
			playbackRate: 4,
			muted: false,
		});
		expect(withVideo.scenes[0]?.blocks[0]).toMatchObject({
			borderRadius: 0,
			trim: { startMs: 0, endMs: 4_000 },
			playbackRate: 1,
			muted: true,
		});
	});

	it("moves a layer one step or to either edge of the scene stack", () => {
		const withCode = addCodeLayer(project(), "scene-1", {
			id: "code-overlay",
			code: "const order = 'visible';",
		});
		const withCaption = addTextLayer(withCode, "scene-1", {
			id: "caption-overlay",
			text: "On top",
		});

		const forward = reorderLayer(withCaption, "scene-1", "starter-text", "forward");
		const front = reorderLayer(forward, "scene-1", "starter-text", "front");
		const backward = reorderLayer(front, "scene-1", "starter-text", "backward");
		const back = reorderLayer(backward, "scene-1", "starter-text", "back");

		expect(forward.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"code-overlay",
			"starter-text",
			"caption-overlay",
		]);
		expect(front.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"code-overlay",
			"caption-overlay",
			"starter-text",
		]);
		expect(backward.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"code-overlay",
			"starter-text",
			"caption-overlay",
		]);
		expect(back.scenes[0]?.blocks.map((block) => block.id)).toEqual([
			"starter-text",
			"code-overlay",
			"caption-overlay",
		]);
		expect(reorderLayer(back, "scene-1", "starter-text", "back")).toBe(back);
	});
});
