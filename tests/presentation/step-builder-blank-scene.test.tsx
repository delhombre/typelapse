import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/**
 * Ticket #96: "Add scene" offers a scene without code beside Capture, so a
 * launch video can open on a title card.
 */
function loadProject(steps: boolean) {
	const project = TEMPLATE_CATALOG[0]?.project;
	if (!project) {
		throw new Error("The template catalog must contain a project");
	}
	useSnippetStore
		.getState()
		.importFromJson(JSON.stringify(steps ? project : { ...project, steps: [] }));
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	useStudioCompositionSelectionStore.getState().selectAudioCue(null);
}

describe("Add a blank scene", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});
	afterEach(() => cleanup());

	it("appends a scene without code from the scene list, selects it and names it", () => {
		loadProject(true);
		const before = useSnippetStore.getState().snippet.steps.length;
		render(<StepBuilder />);

		fireEvent.click(screen.getByRole("button", { name: "Blank" }));

		const { snippet, currentStepIndex } = useSnippetStore.getState();
		expect(snippet.steps).toHaveLength(before + 1);
		expect(snippet.steps.at(-1)?.hasCode).toBe(false);
		expect(currentStepIndex).toBe(before);
		const row = screen
			.getByRole("button", { name: `Delete scene ${before + 1}` })
			.closest("[draggable]");
		if (!(row instanceof HTMLElement)) {
			throw new Error("The new scene must have a row");
		}
		expect(within(row).getByText("No code")).toBeTruthy();
		// Focus lines spotlight code, which a blank scene has none of.
		expect(within(row).queryByRole("textbox", { name: /focus lines/ })).toBeNull();
		expect(within(row).getByRole("textbox", { name: /caption/ })).toBeTruthy();
	});

	it("is offered beside Capture in the desktop inspector too", () => {
		loadProject(true);
		render(<SceneInspector />);
		fireEvent.click(screen.getByRole("button", { name: "Blank" }));
		expect(useSnippetStore.getState().snippet.steps.at(-1)?.hasCode).toBe(false);
	});

	it("draws no card in the composition, which the device and server routes then carry", () => {
		loadProject(true);
		expect(hasAuthoredMultimedia()).toBe(false);

		useSnippetStore.getState().addBlankScene();
		synchronizeStudioCompositionStore();

		const scenes = useStudioCompositionStore.getState().value.project.scenes;
		expect(scenes.at(-1)?.blocks).toEqual([]);
		// A scene without a card is something only the composition route can draw.
		expect(hasAuthoredMultimedia()).toBe(true);
	});

	it("opens a fresh studio on a title card when Blank comes first", () => {
		loadProject(false);
		useSnippetStore.getState().addBlankScene();
		synchronizeStudioCompositionStore();

		const [title] = useStudioCompositionStore.getState().value.project.scenes;
		expect(title?.blocks.map((block) => block.kind)).toEqual(["text"]);
		// Capture still takes the editor's code as the next scene.
		useSnippetStore.getState().captureStep();
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.hasCode)).toEqual([
			false,
			true,
		]);
	});
});
