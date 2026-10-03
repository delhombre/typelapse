import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { AudioCue } from "@/domain/entities/audio-cue";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

function scenes(...durations: number[]): void {
	let snippet = Snippet.create({ title: "Clock", code: "const a = 1;", language: "typescript" });
	durations.forEach((duration, index) => {
		snippet = snippet.addStep(Step.create({ code: `const a = ${index};`, duration }));
	});
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null, playbackProgress: 0 });
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
}

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
	useStudioCompositionStore.getState().transact((project) =>
		project.registerAsset(asset).addAudioCue(
			AudioCue.create({
				id: "cue",
				assetId: asset.id,
				trim: { startMs: 0, endMs: durationMs },
			}),
		),
	);
}

function total(): string | null {
	return document.querySelector(".studio-timeline-total")?.textContent ?? null;
}

describe("StudioTimeline playback", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
		useExportStore.setState({ transitionMs: 650, loop: false });
	});

	afterEach(() => {
		useSnippetStore.getState().pause();
		cleanup();
	});

	it("says the real duration of two 1 s scenes, not the ruler's end", () => {
		scenes(1000, 1000);
		render(<StudioTimeline />);

		expect(total()).toBe("00:02.6");
	});

	it("counts the audio tail in the duration", () => {
		scenes(1000, 1000);
		audioCue(20_000);
		render(<StudioTimeline />);

		expect(total()).toBe("00:20.0");
	});

	it("counts the loop morph in the duration when Loop is on", () => {
		scenes(1000, 1000);
		useExportStore.setState({ loop: true });
		render(<StudioTimeline />);

		expect(total()).toBe("00:03.3");
	});

	it("lets one scene play", () => {
		scenes(2000);
		render(<StudioTimeline />);

		expect(screen.getByRole("button", { name: "Play timeline" })).toHaveProperty("disabled", false);
	});

	it("lets audio alone play", () => {
		scenes();
		audioCue(5000);
		render(<StudioTimeline />);

		expect(screen.getByRole("button", { name: "Play timeline" })).toHaveProperty("disabled", false);
		expect(total()).toBe("00:05.0");
	});

	it("keeps Play off while there is nothing to play", () => {
		scenes();
		render(<StudioTimeline />);

		expect(screen.getByRole("button", { name: "Play timeline" })).toHaveProperty("disabled", true);
	});

	it("updates the duration when a cue lands while the timeline is open", () => {
		scenes(1000);
		render(<StudioTimeline />);
		expect(total()).toBe("00:01.0");

		act(() => audioCue(8000));

		expect(total()).toBe("00:08.0");
	});
});
