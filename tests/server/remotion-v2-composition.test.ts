import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	compileV2RemotionComposition,
	projectRemotionVideoTiming,
} from "../../server/remotion/v2/composition";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";
import { proofDocument } from "./remotion-v2-proof-document";

const CHECKSUM = createHash("sha256").update("private-image-bytes").digest("hex");

function imageAndTextDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Composition",
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
					fileName: "ignored.png",
					mimeType: "image/png",
					byteSize: 19,
					checksum: CHECKSUM,
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
							focalPoint: { x: 0.75, y: 0.5 },
							borderRadius: 28,
							opacity: 0.8,
							placement: { x: 0.25, y: 0, width: 0.5, height: 1 },
						},
						{
							id: "text-block",
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

function audioOnlyDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-audio",
			title: "Audio only",
			canvas: { width: 1920, height: 1080, background: "#090909" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "audio-1",
					kind: "audio",
					fileName: "ignored.wav",
					mimeType: "audio/wav",
					byteSize: 128,
					checksum: "a".repeat(64),
					durationMs: 2_000,
				},
			],
			audioCues: [
				{
					id: "cue-1",
					assetId: "audio-1",
					startMs: 500,
					trim: { startMs: 250, endMs: 1_250 },
					gain: 0.75,
					fadeInMs: 100,
					fadeOutMs: 200,
				},
			],
			scenes: [],
		},
	};
}

function videoAndCodeDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-video",
			title: "Video and code",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [
				{
					id: "video-1",
					kind: "video",
					fileName: "ignored.mp4",
					mimeType: "video/mp4",
					byteSize: 256,
					checksum: "b".repeat(64),
					width: 1920,
					height: 1080,
					durationMs: 4_000,
				},
			],
			audioCues: [],
			scenes: [
				{
					id: "scene-video",
					durationMs: 1_000,
					blocks: [
						{
							id: "video-block",
							kind: "video",
							assetId: "video-1",
							fit: "contain",
							focalPoint: { x: 0.5, y: 0.5 },
							trim: { startMs: 250, endMs: 3_000 },
							playbackRate: 2,
							muted: true,
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
						},
						{
							id: "code-block",
							kind: "code",
							code: "const rendered = true;",
							language: "typescript",
							themeName: "midnight",
							chrome: "none",
							showLineNumbers: true,
							lineNumberStart: 7,
							framePadding: 24,
							cardMargin: 32,
							opacity: 1,
							placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
						},
					],
				},
			],
		},
	};
}

describe("Remotion V2 composition", () => {
	it("compiles a deterministic image and text frame without persisted URLs", () => {
		const composition = compileV2RemotionComposition({
			input: {
				document: imageAndTextDocument(),
				assetSources: [{ assetId: "image-1", publicPath: "assets/asset-0.png" }],
				includeAudio: true,
			},
			fps: 30,
			width: 1920,
			height: 1080,
			resolvePublicAsset: (publicPath) => `bundle://${publicPath}`,
		});

		expect(composition.totalFrames).toBe(30);
		expect(composition.frameAt(0)).toMatchObject({
			background: "#111111",
			layers: [
				{
					kind: "image",
					blockId: "image-block",
					borderRadius: 28,
					source: "bundle://assets/asset-0.png",
					opacity: 0.8,
					box: { x: 480, y: 0, width: 960, height: 1080 },
					fit: {
						source: { x: 800, y: 0, width: 800, height: 900 },
						destination: { x: 480, y: 0, width: 960, height: 1080 },
					},
					mediaRect: { x: -960, y: 0, width: 1920, height: 1080 },
				},
				{
					kind: "text",
					blockId: "text-block",
					text: "Actual V2 text",
					visual: {
						fontFamily: "Inter",
						fontSize: 64,
						fontWeight: 700,
						color: "#ffffff",
						textAlign: "center",
						justifyContent: "center",
						lineHeight: 1.08,
						letterSpacing: "-0.035em",
					},
				},
			],
		});
	});

	it("ends a looping file on the first scene arriving", () => {
		const base = imageAndTextDocument();
		const title = base.project.scenes[0]?.blocks.find((block) => block.kind === "text");
		if (!title) {
			throw new Error("fixture lost its title");
		}
		const composition = compileV2RemotionComposition({
			input: {
				document: {
					...base,
					project: {
						...base.project,
						assets: [],
						scenes: [
							{
								id: "scene-1",
								durationMs: 1_000,
								transitionOut: { kind: "magic-move", durationMs: 650 },
								blocks: [{ ...title, id: "first" }],
							},
							{ id: "scene-2", durationMs: 1_000, blocks: [{ ...title, id: "second" }] },
						],
					},
				},
				assetSources: [],
				includeAudio: false,
				loop: true,
			},
			fps: 30,
			width: 1920,
			height: 1080,
			resolvePublicAsset: (publicPath) => `bundle://${publicPath}`,
		});

		expect(composition.totalFrames).toBe(99);
		const last = composition.frameAt(98).layers;
		expect(last.map((layer) => layer.blockId)).toEqual(["second", "first"]);
		expect(last[1]?.opacity).toBeGreaterThan(0.99 * (title.opacity ?? 1));
	});

	it("compiles an audio-only document into a trimmed deterministic track", () => {
		const composition = compileV2RemotionComposition({
			input: {
				document: audioOnlyDocument(),
				assetSources: [{ assetId: "audio-1", publicPath: "assets/asset-0.wav" }],
				includeAudio: true,
			},
			fps: 30,
			width: 1920,
			height: 1080,
			resolvePublicAsset: (publicPath) => `bundle://${publicPath}`,
		});

		expect(composition.totalFrames).toBe(45);
		expect(composition.frameAt(20).layers).toEqual([]);
		expect(composition.audioTracks).toEqual([
			{
				cueId: "cue-1",
				source: "bundle://assets/asset-0.wav",
				fromFrame: 15,
				durationInFrames: 30,
				trimBeforeFrame: 8,
				trimAfterFrame: 38,
				gain: 0.75,
				fadeInFrames: 3,
				fadeOutFrames: 6,
			},
		]);
	});

	it("resolves real video time and leaves the code block to the card", () => {
		const composition = compileV2RemotionComposition({
			input: {
				document: videoAndCodeDocument(),
				assetSources: [{ assetId: "video-1", publicPath: "assets/asset-0.mp4" }],
				includeAudio: true,
			},
			fps: 30,
			width: 1920,
			height: 1080,
			resolvePublicAsset: (publicPath) => `bundle://${publicPath}`,
		});

		expect(composition.frameAt(15).layers).toMatchObject([
			{
				kind: "video",
				blockId: "video-block",
				source: "bundle://assets/asset-0.mp4",
				sourceTimeMs: 1_250,
				trimStartMs: 250,
				playbackRate: 2,
				sourceEnded: false,
				muted: true,
				mediaRect: { x: 0, y: 0, width: 1920, height: 1080 },
			},
		]);
		// No renderer draws a code block from its placement: the studio's card does.
		expect(composition.frameAt(15).layers).toHaveLength(1);
		expect(
			projectRemotionVideoTiming({ frame: 15, fps: 30, sourceTimeMs: 1_250 }),
		).toEqual({ sourceFrame: 38, sequenceFromFrame: -23 });
	});

	it("splits the layers around the card and fades the card with its scene", () => {
		const composition = compileV2RemotionComposition({
			input: {
				document: proofDocument(),
				assetSources: [{ assetId: "asset-proof-photo", publicPath: "assets/asset-0.png" }],
				includeAudio: false,
			},
			fps: 60,
			width: 1920,
			height: 1080,
			resolvePublicAsset: (publicPath) => `bundle://${publicPath}`,
		});

		// Title card: the card is hidden and the texts, authored after it, lie over it.
		const t0 = composition.frameAt(0);
		expect(t0.codeOpacity).toBe(0);
		expect(t0.layers.map((layer) => [layer.blockId, layer.slot])).toEqual([
			["headline", "over-code"],
			["byline", "over-code"],
		]);
		// Mid-morph (t = 2.0 s): the card is half way in, the photo under it.
		const mid = composition.frameAt(120);
		expect(mid.codeOpacity).toBeCloseTo(0.5, 1);
		expect(mid.layers.find((layer) => layer.blockId === "photo")?.slot).toBe("under-code");
		// Scene 2 holds: a whole card over the photo, which keeps its project-canvas box.
		const scene2 = composition.frameAt(150);
		expect(scene2.codeOpacity).toBe(1);
		expect(scene2.layers).toMatchObject([
			{
				kind: "image",
				blockId: "photo",
				slot: "under-code",
				borderRadius: 48,
				box: { x: 1152, y: 0.12 * 1080, width: 0.34 * 1920, height: 0.76 * 1080 },
			},
		]);
		// The last frame is code alone.
		expect(composition.totalFrames).toBe(390);
		expect(composition.frameAt(389).layers).toEqual([]);
		expect(composition.frameAt(389).codeOpacity).toBe(1);
	});

	it("keeps layer boxes in project pixels and scales the surface to the output", () => {
		const composition = compileV2RemotionComposition({
			input: {
				document: proofDocument(),
				assetSources: [{ assetId: "asset-proof-photo", publicPath: "assets/asset-0.png" }],
				includeAudio: false,
			},
			fps: 30,
			width: 3840,
			height: 2160,
			resolvePublicAsset: (publicPath) => `bundle://${publicPath}`,
		});

		expect(composition.surfaceScale).toBe(2);
		expect(composition.frameAt(0).layers[0]?.box).toEqual({
			x: 192,
			y: 324,
			width: 1536,
			height: 194.4,
		});
	});
});
