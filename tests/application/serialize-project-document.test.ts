import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import { TextBlock } from "@/domain/entities/block";
import { describe, expect, it } from "vitest";

function multimediaDocument(): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-mixed",
			title: "Mixed story",
			canvas: { width: 1920, height: 1080, background: "mesh:solar" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
				watermark: "@studio",
			},
			assets: [
				{
					id: "image-1",
					kind: "image",
					fileName: "hero.png",
					mimeType: "image/png",
					byteSize: 100,
					checksum: "sha256:image",
					width: 1600,
					height: 900,
				},
				{
					id: "audio-1",
					kind: "audio",
					fileName: "voice.wav",
					mimeType: "audio/wav",
					byteSize: 200,
					checksum: "sha256:audio",
					durationMs: 2_000,
				},
			],
			audioCues: [
				{
					id: "cue-1",
					assetId: "audio-1",
					startMs: 250,
					trim: { startMs: 0, endMs: 2_000 },
					gain: 0.75,
					fadeInMs: 100,
					fadeOutMs: 100,
				},
			],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1_500,
					caption: "A real composition",
					transitionOut: { kind: "crossfade", durationMs: 300 },
					blocks: [
						{
							id: "text-1",
							kind: "text",
							text: "Words and pictures",
							typography: {
								fontFamily: "Inter",
								fontSize: 64,
								fontWeight: 700,
								color: "#fff",
								align: "center",
							},
							opacity: 1,
							placement: { x: 0.1, y: 0.05, width: 0.8, height: 0.2 },
						},
						{
							id: "image-block-1",
							kind: "image",
							assetId: "image-1",
							fit: "cover",
							focalPoint: { x: 0.4, y: 0.5 },
							borderRadius: 24,
							opacity: 0.9,
							placement: { x: 0.15, y: 0.3, width: 0.7, height: 0.6 },
						},
					],
				},
			],
		},
	};
}

describe("serializeProjectDocument", () => {
	it("round-trips the canonical mixed-media aggregate without losing authoring data", () => {
		const document = multimediaDocument();

		const serialized = serializeProjectDocument(hydrateProjectDocument(document));

		expect(serialized).toEqual(document);
		expect(hydrateProjectDocument(serialized).project.durationMs).toBe(2_250);
	});

	it("serializes immutable scene edits back to the hosted V2 contract", () => {
		const hydrated = hydrateProjectDocument(multimediaDocument());
		const subtitle = TextBlock.create({
			id: "text-2",
			text: "Sound included",
			placement: { x: 0.2, y: 0.82, width: 0.6, height: 0.1 },
			typography: {
				fontFamily: "Inter",
				fontSize: 32,
				fontWeight: 500,
				color: "#ddd",
				align: "center",
			},
		});
		const layered = hydrated.project.addBlock("scene-1", subtitle);
		const project = layered.replaceScene(layered.scenes[0]?.withDuration(2_400) ?? neverScene());

		const serialized = serializeProjectDocument({ ...hydrated, project });

		expect(serialized.project.scenes[0]).toMatchObject({
			durationMs: 2_400,
			blocks: [{ id: "text-1" }, { id: "image-block-1" }, { id: "text-2" }],
		});
	});
});

function neverScene(): never {
	throw new Error("Expected a scene");
}
