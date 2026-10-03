import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { Asset } from "@/domain/entities/asset";
import { AudioCue } from "@/domain/entities/audio-cue";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Scenes of the given lengths, nothing else authored. */
function scenes(...durations: number[]): void {
	let snippet = Snippet.create({ title: "Clock", code: "const a = 1;", language: "typescript" });
	durations.forEach((duration, index) => {
		snippet = snippet.addStep(Step.create({ code: `const a = ${index};`, duration }));
	});
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null, playbackProgress: 0 });
	// A fresh composition: no media left over from the previous test.
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
}

/** A cue of `durationMs` starting at zero, as an audio drop places it. */
function audioCue(durationMs: number): void {
	const asset = Asset.create({
		id: "music",
		kind: "audio",
		fileName: "music.wav",
		mimeType: "audio/wav",
		byteSize: 1000,
		checksum: "music-checksum",
		durationMs,
	});
	useStudioCompositionStore
		.getState()
		.transact((project) =>
			(project.assets.some((candidate) => candidate.id === asset.id)
				? project
				: project.registerAsset(asset)
			).addAudioCue(
				AudioCue.create({ id: "cue", assetId: asset.id, trim: { startMs: 0, endMs: durationMs } }),
			),
		);
}

describe("the studio playback clock", () => {
	beforeEach(() => {
		useExportStore.setState({ transitionMs: 650, loop: false });
	});

	afterEach(() => {
		useSnippetStore.getState().pause();
	});

	it("runs two 1 s scenes and a 20 s cue for 20 s, holding the last scene", () => {
		scenes(1000, 1000);
		audioCue(20_000);

		useSnippetStore.getState().seekPlayback(0.5);

		const state = useSnippetStore.getState();
		expect(state.playbackElapsedMs).toBe(10_000);
		expect(state.playback).toMatchObject({ phase: "hold", index: 1, t: 1 });
		expect(state.currentStepIndex).toBe(1);
	});

	it("plays a project of one scene", async () => {
		scenes(2000);

		await useSnippetStore.getState().play();

		expect(useSnippetStore.getState().isPlaying).toBe(true);
	});

	it("plays audio alone, with no captured scene", async () => {
		scenes();
		audioCue(5000);

		await useSnippetStore.getState().play();

		expect(useSnippetStore.getState().isPlaying).toBe(true);
	});

	it("does not play a project with nothing in it yet", async () => {
		scenes();

		await useSnippetStore.getState().play();

		expect(useSnippetStore.getState().isPlaying).toBe(false);
	});

	it("plays the loop morph when Loop is on, as the exported file does", () => {
		scenes(1000, 1000);
		useExportStore.setState({ loop: true });

		// Scenes and morph end at 2650; the loop morph runs to 3300.
		useSnippetStore.getState().seekPlayback(3000 / 3300);

		const state = useSnippetStore.getState();
		expect(state.playback?.phase).toBe("loop");
		expect(state.playback?.index).toBe(1);
		expect(state.playbackElapsedMs).toBeCloseTo(3000);
	});

	it("plays the loop morph on a multimedia project too, as the server file does", () => {
		scenes(1000, 1000);
		audioCue(1000);
		useExportStore.setState({ loop: true });
		const file = compileSceneTimeline({
			document: useStudioCompositionStore.getState().toDocument(),
			fps: 30,
			loop: true,
		});

		useSnippetStore.getState().seekPlayback(1);

		const state = useSnippetStore.getState();
		expect(state.playback?.phase).toBe("loop");
		expect(state.playbackElapsedMs).toBe(3300);
		expect(file.durationMs).toBe(3300);
	});

	it("still runs to an audio tail longer than the loop", () => {
		scenes(1000, 1000);
		audioCue(10_000);
		useExportStore.setState({ loop: true });

		useSnippetStore.getState().seekPlayback(1);

		expect(useSnippetStore.getState().playbackElapsedMs).toBe(10_000);
	});
});
