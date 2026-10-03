import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { StudioHistoryControls } from "@/presentation/components/layout/studio-history-controls";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	loadStudioCompositionDocument,
	readStudioCompositionSnapshot,
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

function textLayerCount(): number {
	const state = useStudioCompositionStore.getState();
	return state.value.project.scenes
		.flatMap((scene) => scene.blocks)
		.filter((block) => block.kind === "text").length;
}

let stop: () => void = () => undefined;

describe("StudioHistoryControls", () => {
	beforeEach(() => {
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		loadStudioCompositionDocument(
			createStudioCompositionDocument({
				...readStudioCompositionSnapshot(),
				projectId: "controls",
			}),
		);
		stop = studioHistory.start();
	});

	afterEach(() => {
		stop();
		cleanup();
	});

	it("offers nothing to undo on a project that has not been edited", () => {
		render(<StudioHistoryControls />);

		expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByRole("button", { name: "Redo" }).hasAttribute("disabled")).toBe(true);
	});

	it("undoes and redoes a layer edit, like every other edit", () => {
		render(<StudioHistoryControls />);
		const sceneId = useStudioCompositionStore.getState().selectedSceneId ?? "";
		act(() => {
			useStudioCompositionStore
				.getState()
				.transact((project) => addTextLayer(project, sceneId, { id: "title", text: "Title" }));
			studioHistory.capture();
		});

		fireEvent.click(screen.getByRole("button", { name: "Undo" }));
		expect(textLayerCount()).toBe(0);
		fireEvent.click(screen.getByRole("button", { name: "Redo" }));
		expect(textLayerCount()).toBe(1);
	});

	it("undoes a code edit", () => {
		render(<StudioHistoryControls />);
		const before = useSnippetStore.getState().snippet.code;
		act(() => {
			useSnippetStore.getState().setCode(`${before}\n// typed`);
			studioHistory.capture();
		});

		fireEvent.click(screen.getByRole("button", { name: "Undo" }));

		expect(useSnippetStore.getState().snippet.code).toBe(before);
	});
});
