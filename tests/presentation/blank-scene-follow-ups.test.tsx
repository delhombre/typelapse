import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { StudioLayerStrip } from "@/presentation/components/editor/studio-layer-strip";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
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

/** #106: what #96's blank scenes left behind in the timeline, the layer strip and on a phone. */
beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
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

describe("the timeline's Add scene", () => {
	it("offers Blank beside Capture, and Blank adds a scene without code", () => {
		const before = useSnippetStore.getState().snippet.steps.length;
		render(<StudioTimeline />);

		fireEvent.click(screen.getByRole("button", { name: "Blank" }));

		const { snippet, currentStepIndex } = useSnippetStore.getState();
		expect(snippet.steps).toHaveLength(before + 1);
		expect(snippet.steps.at(-1)?.hasCode).toBe(false);
		expect(currentStepIndex).toBe(before);
	});

	it("still captures the editor's code as a scene", () => {
		render(<StudioTimeline />);
		fireEvent.click(screen.getByRole("button", { name: "Add scene" }));
		expect(useSnippetStore.getState().snippet.steps.at(-1)?.hasCode).toBe(true);
	});
});

describe("the layer strip on a blank scene", () => {
	function blankSceneWithText() {
		useSnippetStore.getState().addBlankScene();
		synchronizeStudioCompositionStore();
		const scene = useStudioCompositionStore.getState().value.project.scenes.at(-1);
		if (!scene) {
			throw new Error("The blank scene must be in the composition");
		}
		act(() => {
			const composition = useStudioCompositionStore.getState();
			composition.transact((project) =>
				addTextLayer(project, scene.id, { id: "title", text: "Title" }),
			);
			composition.selectBlock(scene.id, null);
		});
	}

	it("has no Code chip, because the scene has no code", () => {
		blankSceneWithText();
		render(<StudioLayerStrip />);

		expect(screen.getByRole("button", { name: "Text" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Code" })).toBeNull();
		expect(screen.queryByRole("button", { name: /code layer/ })).toBeNull();
	});

	it("returns to the scene's own fields when the selected chip is pressed again", () => {
		blankSceneWithText();
		render(<StudioLayerStrip />);
		const text = screen.getByRole("button", { name: "Text" });

		fireEvent.click(text);
		expect(useStudioCompositionStore.getState().selectedBlockId).toBe("title");
		expect(text.getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(text);
		expect(useStudioCompositionStore.getState().selectedBlockId).toBeNull();
	});

	it("keeps the Code chip on a scene with code", () => {
		const sceneId = useStudioCompositionStore.getState().selectedSceneId;
		if (!sceneId) {
			throw new Error("The composition must have a selected scene");
		}
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => addTextLayer(project, sceneId, { id: "title", text: "Title" }));
		});
		render(<StudioLayerStrip />);

		expect(screen.getByRole("button", { name: "Code" })).toBeTruthy();
	});
});

describe("the add controls under a finger", () => {
	it("are 44px tall in the scene list and the inspector", () => {
		for (const view of [<StepBuilder key="list" />, <SceneInspector key="inspector" />]) {
			const { unmount } = render(view);
			for (const name of ["Record", "Blank", "Capture"]) {
				expect(screen.getByRole("button", { name }).className).toContain("pointer-coarse:h-11");
			}
			unmount();
		}
	});
});
