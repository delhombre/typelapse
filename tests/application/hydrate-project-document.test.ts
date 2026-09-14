import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { migrateV1ToV2 } from "@/application/project/migrate-v1-project";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { describe, expect, it } from "vitest";

describe("hydrateProjectDocument", () => {
	it("hydrates a migrated code project without changing stable identities", () => {
		const document = migrateV1ToV2({
			title: "Code story",
			code: "const answer = 42;",
			language: "typescript",
			themeName: "nord",
			background: "mesh:solar",
			steps: [{ code: "const answer = 42;", duration: 900, caption: "Answer" }],
		});

		const hydrated = hydrateProjectDocument(document);
		const scene = hydrated.project.scenes[0];
		const block = scene?.blocks[0];

		expect(hydrated.project.id).toBe(document.project.id);
		expect(scene?.id).toBe(document.project.scenes[0]?.id);
		expect(scene?.caption).toBe("Answer");
		expect(block).toMatchObject({
			id: document.project.scenes[0]?.blocks[0]?.id,
			kind: "code",
			code: "const answer = 42;",
			continuityKey: "primary-code",
		});
		expect(hydrated.settings).toEqual(document.project.settings);
	});

	it("hydrates code, text, image, video and audio in one project", () => {
		const document: ProjectDocumentV2 = {
			schemaVersion: 2,
			project: {
				id: "project-media",
				title: "Launch film",
				canvas: { width: 1920, height: 1080, background: "#111" },
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
						fileName: "hero.png",
						mimeType: "image/png",
						byteSize: 10,
						checksum: "sha256:image",
						width: 1600,
						height: 900,
					},
					{
						id: "video-1",
						kind: "video",
						fileName: "demo.mp4",
						mimeType: "video/mp4",
						byteSize: 20,
						checksum: "sha256:video",
						width: 1920,
						height: 1080,
						durationMs: 5000,
					},
					{
						id: "audio-1",
						kind: "audio",
						fileName: "voice.wav",
						mimeType: "audio/wav",
						byteSize: 30,
						checksum: "sha256:audio",
						durationMs: 3000,
					},
				],
				audioCues: [
					{
						id: "cue-voice",
						assetId: "audio-1",
						startMs: 500,
						trim: { startMs: 0, endMs: 3000 },
						gain: 0.8,
						fadeInMs: 100,
						fadeOutMs: 100,
					},
				],
				scenes: [
					{
						id: "scene-1",
						durationMs: 2000,
						transitionOut: { kind: "crossfade", durationMs: 400 },
						blocks: [
							{
								id: "code-1",
								kind: "code",
								code: "const launch = true;",
								language: "typescript",
								themeName: "midnight",
								chrome: "macos",
								showLineNumbers: true,
								lineNumberStart: 1,
								framePadding: 24,
								cardMargin: 32,
								opacity: 1,
								placement: { x: 0.1, y: 0.1, width: 0.35, height: 0.2 },
							},
							{
								id: "text-1",
								kind: "text",
								text: "Make it move",
								typography: {
									fontFamily: "Inter",
									fontSize: 72,
									fontWeight: 700,
									color: "#fff",
									align: "center",
								},
								opacity: 1,
								placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
							},
							{
								id: "image-block",
								kind: "image",
								assetId: "image-1",
								fit: "contain",
								focalPoint: { x: 0.5, y: 0.5 },
								opacity: 1,
								placement: { x: 0.1, y: 0.35, width: 0.35, height: 0.55 },
							},
							{
								id: "video-block",
								kind: "video",
								assetId: "video-1",
								fit: "cover",
								focalPoint: { x: 0.5, y: 0.5 },
								trim: { startMs: 500, endMs: 2500 },
								playbackRate: 1,
								muted: true,
								opacity: 0.9,
								placement: { x: 0.55, y: 0.35, width: 0.35, height: 0.55 },
							},
						],
					},
				],
			},
		};

		const hydrated = hydrateProjectDocument(document);

		expect(hydrated.project.assets.map((asset) => asset.kind)).toEqual(["image", "video", "audio"]);
		expect(hydrated.project.scenes[0]?.blocks.map((block) => block.kind)).toEqual([
			"code",
			"text",
			"image",
			"video",
		]);
		expect(hydrated.project.audioCues[0]).toMatchObject({
			id: "cue-voice",
			assetId: "audio-1",
			endMs: 3500,
		});
		expect(hydrated.project.durationMs).toBe(3500);
		expect(hydrated.project.scenes[0]?.transitionOut).toEqual({
			kind: "crossfade",
			durationMs: 400,
		});
	});

	it("hydrates an audio-only project with no visual scene", () => {
		const document: ProjectDocumentV2 = {
			schemaVersion: 2,
			project: {
				id: "audio-project",
				title: "Podcast sting",
				canvas: { width: 1920, height: 1080, background: "#000" },
				settings: {
					progressStyle: "none",
					transitionMs: 650,
					typewriter: false,
					focusZoom: false,
				},
				assets: [
					{
						id: "sting",
						kind: "audio",
						fileName: "sting.wav",
						mimeType: "audio/wav",
						byteSize: 100,
						checksum: "sha256:sting",
						durationMs: 1200,
					},
				],
				audioCues: [
					{
						id: "sting-cue",
						assetId: "sting",
						startMs: 300,
						trim: { startMs: 200, endMs: 1200 },
						gain: 1,
						fadeInMs: 0,
						fadeOutMs: 100,
					},
				],
				scenes: [],
			},
		};

		const hydrated = hydrateProjectDocument(document);

		expect(hydrated.project.scenes).toEqual([]);
		expect(hydrated.project.audioCues).toHaveLength(1);
		expect(hydrated.project.durationMs).toBe(1300);
	});

	it("defensively snapshots settings and audio cues", () => {
		const document = migrateV1ToV2({
			title: "Snapshot",
			code: "x",
			language: "text",
			themeName: "midnight",
			background: "#000",
			steps: [],
		});

		const hydrated = hydrateProjectDocument(document);
		document.project.settings.progressStyle = "bar";

		expect(hydrated.settings.progressStyle).toBe("reels");
		expect(Object.isFrozen(hydrated.settings)).toBe(true);
		expect(Object.isFrozen(hydrated.project.audioCues)).toBe(true);
	});
});
