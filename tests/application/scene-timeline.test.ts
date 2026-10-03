import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { describe, expect, it } from "vitest";

const BASE_SETTINGS = {
	progressStyle: "none" as const,
	transitionMs: 650 as const,
	typewriter: false,
	focusZoom: false,
};

function documentWith(overrides: Partial<ProjectDocumentV2["project"]>): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Multimedia",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: BASE_SETTINGS,
			assets: [],
			audioCues: [],
			scenes: [],
			...overrides,
		},
	};
}

const TEXT_BLOCK = {
	id: "text-1",
	kind: "text" as const,
	text: "A story, not just code",
	opacity: 0.8,
	placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.25 },
	typography: {
		fontFamily: "Inter",
		fontSize: 72,
		fontWeight: 700,
		color: "#ffffff",
		align: "center" as const,
	},
};

describe("compileSceneTimeline", () => {
	it("renders a standalone text scene without requiring code", () => {
		const timeline = compileSceneTimeline({
			document: documentWith({
				scenes: [{ id: "scene-1", durationMs: 1_000, blocks: [TEXT_BLOCK] }],
			}),
			fps: 30,
		});

		expect(timeline.totalFrames).toBe(30);
		expect(timeline.frameAt(15)).toMatchObject({
			timeMs: 500,
			scenes: [{ sceneId: "scene-1", opacity: 1 }],
			layers: [{ kind: "text", blockId: "text-1", opacity: 0.8 }],
		});
	});

	it("resolves image and video layers plus deterministic video source time", () => {
		const timeline = compileSceneTimeline({
			document: documentWith({
				assets: [
					{
						id: "image-1",
						kind: "image",
						fileName: "still.png",
						mimeType: "image/png",
						byteSize: 100,
						checksum: "a".repeat(64),
						width: 1600,
						height: 900,
					},
					{
						id: "video-1",
						kind: "video",
						fileName: "clip.mp4",
						mimeType: "video/mp4",
						byteSize: 200,
						checksum: "b".repeat(64),
						width: 1920,
						height: 1080,
						durationMs: 8_000,
					},
				],
				scenes: [
					{
						id: "scene-1",
						durationMs: 2_000,
						blocks: [
							{
								id: "image-block",
								kind: "image",
								assetId: "image-1",
								fit: "cover",
								focalPoint: { x: 0.25, y: 0.5 },
								opacity: 1,
								placement: { x: 0, y: 0, width: 1, height: 1 },
							},
							{
								id: "video-block",
								kind: "video",
								assetId: "video-1",
								fit: "contain",
								focalPoint: { x: 0.5, y: 0.5 },
								trim: { startMs: 1_000, endMs: 7_000 },
								playbackRate: 2,
								muted: true,
								opacity: 0.9,
								placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
							},
						],
					},
				],
			}),
			fps: 30,
		});

		const frame = timeline.frameAt(15);
		expect(frame.layers.map((layer) => layer.kind)).toEqual(["image", "video"]);
		expect(frame.layers[1]).toMatchObject({
			kind: "video",
			assetId: "video-1",
			sourceTimeMs: 2_000,
			muted: true,
		});
	});

	it("exposes both scenes during a crossfade with complementary opacity", () => {
		const timeline = compileSceneTimeline({
			document: documentWith({
				scenes: [
					{
						id: "scene-a",
						durationMs: 1_000,
						blocks: [{ ...TEXT_BLOCK, id: "text-a", text: "Before" }],
						transitionOut: { kind: "crossfade", durationMs: 1_000 },
					},
					{
						id: "scene-b",
						durationMs: 1_000,
						blocks: [{ ...TEXT_BLOCK, id: "text-b", text: "After" }],
					},
				],
			}),
			fps: 30,
		});

		const frame = timeline.frameAt(45);
		expect(frame.transition).toMatchObject({
			kind: "crossfade",
			fromSceneId: "scene-a",
			toSceneId: "scene-b",
			progress: 0.5,
		});
		expect(frame.scenes).toEqual([
			{ sceneId: "scene-a", localTimeMs: 1_000, opacity: 0.5 },
			{ sceneId: "scene-b", localTimeMs: 0, opacity: 0.5 },
		]);
		expect(frame.layers.map((layer) => layer.opacity)).toEqual([0.4, 0.4]);
	});

	it("supports a valid audio-only project and computes fades on the global timeline", () => {
		const timeline = compileSceneTimeline({
			document: documentWith({
				assets: [
					{
						id: "audio-1",
						kind: "audio",
						fileName: "voice.wav",
						mimeType: "audio/wav",
						byteSize: 400,
						checksum: "c".repeat(64),
						durationMs: 5_000,
					},
				],
				audioCues: [
					{
						id: "cue-1",
						assetId: "audio-1",
						startMs: 500,
						trim: { startMs: 1_000, endMs: 3_000 },
						gain: 0.8,
						fadeInMs: 500,
						fadeOutMs: 500,
					},
				],
			}),
			fps: 20,
		});

		expect(timeline.totalFrames).toBe(50);
		expect(timeline.frameAt(5).audio).toEqual([]);
		expect(timeline.frameAt(15)).toMatchObject({
			timeMs: 750,
			scenes: [],
			layers: [],
			audio: [{ cueId: "cue-1", sourceTimeMs: 1_250, gain: 0.4 }],
		});
		expect(timeline.frameAt(30).audio[0]).toMatchObject({ gain: 0.8, sourceTimeMs: 2_000 });
	});

	it("uses the longest of the visual and audio timelines", () => {
		const timeline = compileSceneTimeline({
			document: documentWith({
				assets: [
					{
						id: "audio-1",
						kind: "audio",
						fileName: "bed.mp3",
						mimeType: "audio/mpeg",
						byteSize: 400,
						checksum: "d".repeat(64),
						durationMs: 4_000,
					},
				],
				audioCues: [
					{
						id: "cue-1",
						assetId: "audio-1",
						startMs: 0,
						trim: { startMs: 0, endMs: 4_000 },
						gain: 1,
						fadeInMs: 0,
						fadeOutMs: 0,
					},
				],
				scenes: [{ id: "scene-1", durationMs: 1_000, blocks: [TEXT_BLOCK] }],
			}),
			fps: 30,
		});

		expect(timeline.durationMs).toBe(4_000);
		expect(timeline.totalFrames).toBe(120);
		expect(timeline.frameAt(119).scenes[0]).toMatchObject({
			sceneId: "scene-1",
			localTimeMs: 1_000,
		});
	});
	describe("with Loop on", () => {
		const twoScenes = () =>
			documentWith({
				scenes: [
					{
						id: "scene-1",
						durationMs: 1_000,
						transitionOut: { kind: "magic-move", durationMs: 650 },
						blocks: [{ ...TEXT_BLOCK, id: "text-1", continuityKey: "title" }],
					},
					{
						id: "scene-2",
						durationMs: 1_000,
						blocks: [
							{
								...TEXT_BLOCK,
								id: "text-2",
								continuityKey: "title",
								placement: { x: 0.2, y: 0.5, width: 0.6, height: 0.25 },
							},
						],
					},
				],
			});

		it("morphs the last scene back to the first for the project's transition", () => {
			const timeline = compileSceneTimeline({ document: twoScenes(), fps: 30, loop: true });

			expect(timeline.durationMs).toBe(1_000 + 650 + 1_000 + 650);
			expect(timeline.totalFrames).toBe(99);
			// Halfway through the loop morph both scenes share the frame.
			const midLoop = timeline.frameAt(Math.round((2_975 / 1_000) * 30));
			expect(midLoop.transition).toMatchObject({
				kind: "magic-move",
				fromSceneId: "scene-2",
				toSceneId: "scene-1",
			});
			expect(midLoop.scenes.map((scene) => scene.sceneId)).toEqual(["scene-2", "scene-1"]);
			// The last frame is the first scene arriving, so the file loops seamlessly.
			const last = timeline.frameAt(timeline.totalFrames - 1);
			expect(last.transition?.toSceneId).toBe("scene-1");
			expect(last.scenes.at(-1)).toMatchObject({ sceneId: "scene-1" });
			expect(last.scenes.at(-1)?.opacity).toBeGreaterThan(0.99);
		});

		it("leaves Loop off, and a single scene, exactly as they were", () => {
			expect(compileSceneTimeline({ document: twoScenes(), fps: 30 }).durationMs).toBe(2_650);
			const single = documentWith({
				scenes: [{ id: "scene-1", durationMs: 1_000, blocks: [TEXT_BLOCK] }],
			});
			expect(compileSceneTimeline({ document: single, fps: 30, loop: true }).durationMs).toBe(
				1_000,
			);
		});
	});
});
