import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	compileV2RemotionComposition,
	projectRemotionVideoTiming,
} from "../../server/remotion/v2/composition";
import type { ProjectDocumentV2 } from "../../src/application/project/project-document";

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

	it("resolves real video time and a static code layer", () => {
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
			{
				kind: "code",
				blockId: "code-block",
				code: "const rendered = true;",
				language: "typescript",
				showLineNumbers: true,
				lineNumberStart: 7,
				visual: {
					themeName: "midnight",
					background: "#0d1117",
					foreground: "#e6edf3",
					chrome: "none",
					fontFamily: "Ioskeley Mono, ui-monospace, monospace",
					fontSize: 18,
					lineHeight: 1.55,
					borderRadius: 12,
					framePadding: 24,
					boxShadow: "0 24px 64px rgb(0 0 0 / 0.22), 0 2px 10px rgb(0 0 0 / 0.16)",
					lineNumberColor: "#e6edf340",
					lineNumberGap: 18,
				},
			},
		]);
		expect(
			projectRemotionVideoTiming({ frame: 15, fps: 30, sourceTimeMs: 1_250 }),
		).toEqual({ sourceFrame: 38, sequenceFromFrame: -23 });
	});
});
