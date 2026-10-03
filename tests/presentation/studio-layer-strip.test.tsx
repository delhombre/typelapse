import { addMediaAsset, addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { Asset } from "@/domain/entities/asset";
import { StudioLayerStrip } from "@/presentation/components/editor/studio-layer-strip";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
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

function selectedSceneId(): string {
	const sceneId = useStudioCompositionStore.getState().selectedSceneId;
	if (!sceneId) {
		throw new Error("The composition must have a selected scene");
	}
	return sceneId;
}

function textLayerCount(): number {
	const state = useStudioCompositionStore.getState();
	const scene = state.value.project.scenes.find(
		(candidate) => candidate.id === state.selectedSceneId,
	);
	return scene?.blocks.filter((block) => block.kind === "text").length ?? 0;
}

describe("StudioLayerStrip", () => {
	beforeEach(() => {
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	});

	afterEach(() => cleanup());

	it("stays absent for a code-only scene", () => {
		const { container } = render(<StudioLayerStrip />);

		expect(container.firstChild).toBeNull();
	});

	it("carries no undo of its own: the project history's buttons are the studio's only ones", () => {
		const sceneId = selectedSceneId();
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => addTextLayer(project, sceneId, { id: "title", text: "Title" }));
		});
		render(<StudioLayerStrip />);

		expect(textLayerCount()).toBe(1);
		expect(screen.getByRole("button", { name: "Text" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /undo|redo/i })).toBeNull();
	});

	it("names media chips after their file, not their kind", () => {
		const sceneId = selectedSceneId();
		const longName = `${"launch-teaser-".repeat(30)}final.png`;
		act(() => {
			useStudioCompositionStore.getState().transact((project) =>
				addMediaAsset(
					addMediaAsset(
						project,
						sceneId,
						Asset.create({
							id: "still",
							kind: "image",
							fileName: longName,
							mimeType: "image/png",
							byteSize: 4,
							checksum: "a".repeat(64),
							width: 10,
							height: 10,
						}),
						{ blockId: "still-block" },
					),
					sceneId,
					Asset.create({
						id: "voice",
						kind: "audio",
						fileName: "voice-over.wav",
						mimeType: "audio/wav",
						byteSize: 4,
						checksum: "b".repeat(64),
						durationMs: 1_000,
					}),
					{ cueId: "voice-cue" },
				),
			);
		});

		render(<StudioLayerStrip />);

		expect(screen.getByRole("button", { name: longName })).toBeTruthy();
		expect(screen.getByRole("button", { name: "voice-over.wav" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Image" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Audio" })).toBeNull();
	});
});
