import {
	deleteAudioCue,
	selectAudioCue,
	updateAudioCue,
} from "@/application/project/audio-cue-authoring";
import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { Asset } from "@/domain/entities/asset";
import { AudioCue } from "@/domain/entities/audio-cue";
import { describe, expect, it } from "vitest";

function projectWithAudio() {
	const project = hydrateProjectDocument(
		createStarterMultimediaProject({
			projectId: "project-audio",
			sceneId: "scene-1",
			textBlockId: "title-1",
		}),
	).project;
	const asset = Asset.create({
		id: "audio-1",
		kind: "audio",
		fileName: "A quiet signal.wav",
		mimeType: "audio/wav",
		byteSize: 24_000,
		checksum: "audio-checksum",
		durationMs: 8_000,
	});
	const cue = AudioCue.create({
		id: "cue-1",
		assetId: asset.id,
		startMs: 400,
		trim: { startMs: 500, endMs: 6_500 },
		gain: 0.75,
		fadeInMs: 250,
		fadeOutMs: 350,
	});
	return project.registerAsset(asset).addAudioCue(cue);
}

describe("audio cue authoring", () => {
	it("selects the cue together with its canonical audio asset", () => {
		const project = projectWithAudio();

		const selection = selectAudioCue(project, "cue-1");

		expect(selection.cue.id).toBe("cue-1");
		expect(selection.asset).toMatchObject({
			id: "audio-1",
			metadata: { kind: "audio", durationMs: 8_000 },
		});
		expect(() => selectAudioCue(project, "missing")).toThrow(
			"Audio cue missing does not belong to project",
		);
	});

	it("patches timing and mix immutably while preserving renderer-facing identity", () => {
		const project = projectWithAudio();

		const updated = updateAudioCue(project, "cue-1", {
			startMs: 1_000,
			trimStartMs: 1_500,
			trimEndMs: 5_500,
			gain: 0.5,
			fadeInMs: 400,
			fadeOutMs: 600,
		});

		expect(updated.audioCues[0]).toMatchObject({
			id: "cue-1",
			assetId: "audio-1",
			startMs: 1_000,
			trim: { startMs: 1_500, endMs: 5_500 },
			gain: 0.5,
			fadeInMs: 400,
			fadeOutMs: 600,
		});
		expect(project.audioCues[0]).toMatchObject({
			startMs: 400,
			trim: { startMs: 500, endMs: 6_500 },
			gain: 0.75,
		});
		expect(updated).not.toBe(project);
	});

	it("rejects trims beyond the registered source and invalid fade combinations", () => {
		const project = projectWithAudio();

		expect(() => updateAudioCue(project, "cue-1", { trimEndMs: 8_001 })).toThrow(
			"Audio cue trim cannot exceed its source duration",
		);
		expect(() =>
			updateAudioCue(project, "cue-1", {
				trimEndMs: 1_000,
				fadeInMs: 300,
				fadeOutMs: 300,
			}),
		).toThrow("Audio cue fades must fit inside its trimmed duration");
	});

	it("deletes a selected cue through the immutable aggregate", () => {
		const project = projectWithAudio();

		const updated = deleteAudioCue(project, "cue-1");

		expect(updated.audioCues).toEqual([]);
		expect(project.audioCues).toHaveLength(1);
		expect(updated.assets.map((asset) => asset.id)).toContain("audio-1");
	});
});
