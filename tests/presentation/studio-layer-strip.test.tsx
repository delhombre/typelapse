import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { StudioLayerStrip } from "@/presentation/components/editor/studio-layer-strip";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

	it("stays absent for a code-only scene with no layer history", () => {
		render(<StudioLayerStrip />);

		expect(screen.queryByRole("button", { name: "Undo layer edit" })).toBeNull();
	});

	it("keeps undo reachable after the last authored layer is deleted", () => {
		const sceneId = selectedSceneId();
		render(<StudioLayerStrip />);
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => addTextLayer(project, sceneId, { id: "title", text: "Title" }));
		});
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => project.removeBlock(sceneId, "title"));
		});
		expect(textLayerCount()).toBe(0);

		fireEvent.click(screen.getByRole("button", { name: "Undo layer edit" }));

		expect(textLayerCount()).toBe(1);
	});

	it("keeps redo reachable after undoing the first authored layer", () => {
		const sceneId = selectedSceneId();
		render(<StudioLayerStrip />);
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => addTextLayer(project, sceneId, { id: "title", text: "Title" }));
		});

		fireEvent.click(screen.getByRole("button", { name: "Undo layer edit" }));
		expect(textLayerCount()).toBe(0);
		fireEvent.click(screen.getByRole("button", { name: "Redo layer edit" }));

		expect(textLayerCount()).toBe(1);
	});
});
