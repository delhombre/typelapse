import { readFileSync } from "node:fs";
import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const scrollIntoView = vi.fn();

describe("StepBuilder selection follow", () => {
	beforeEach(() => {
		scrollIntoView.mockClear();
		Element.prototype.scrollIntoView = scrollIntoView;
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useSnippetStore.getState().setCurrentStepIndex(project.steps.length - 1);
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	});

	afterEach(() => cleanup());

	it("reveals the selected card when selection comes from the timeline", async () => {
		render(<StepBuilder />);

		await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
	});

	it("types every field at 16 px under a coarse pointer, so a phone does not zoom into it", () => {
		const { container } = render(<StepBuilder />);
		const fields = [...container.querySelectorAll("input")];

		expect(fields.length).toBeGreaterThan(0);
		expect(screen.getAllByRole("textbox", { name: /focus lines/ }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole("textbox", { name: /caption/ }).length).toBeGreaterThan(0);
		for (const field of fields) {
			expect(field.className).toContain("sc-scene-field");
		}
		const css = readFileSync("src/presentation/studio-camera.css", "utf8");
		const coarse = css
			.split("@media (pointer: coarse) {")
			.filter((b) => b.includes(".sc-scene-field {"));
		expect(coarse.join("\n")).toMatch(/\.sc-scene-field \{[^}]*font-size:\s*16px/);
	});

	it("keeps the full scene list on mobile and restores a deleted scene in place", () => {
		render(<StepBuilder />);
		const removed = useSnippetStore.getState().snippet.steps[2];
		if (!removed) {
			throw new Error("The template must contain three scenes");
		}

		fireEvent.click(screen.getByRole("button", { name: "Delete scene 3" }));
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).not.toContain(
			removed.id,
		);
		fireEvent.click(screen.getByRole("button", { name: "Undo delete scene 3" }));
		expect(useSnippetStore.getState().snippet.steps[2]?.id).toBe(removed.id);
	});
});

describe("SceneInspector", () => {
	beforeEach(() => {
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useSnippetStore.getState().setCurrentStepIndex(project.steps.length - 1);
	});

	afterEach(() => cleanup());

	it("shows only the selected scene metadata while the timeline owns order and duration", () => {
		render(<SceneInspector />);

		expect(screen.getByText("Scene 3 of 3")).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Scene 3 focus lines" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Scene 3 caption" })).toBeTruthy();
		expect(screen.queryByRole("spinbutton")).toBeNull();
		expect(screen.queryByTitle("Drag to reorder")).toBeNull();
	});

	it("follows timeline selection without duplicating the scene list", () => {
		render(<SceneInspector />);

		act(() => useSnippetStore.getState().setCurrentStepIndex(0));

		expect(screen.getByText("Scene 1 of 3")).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Scene 1 caption" })).toBeTruthy();
	});

	it("gives the scene inspector to layer navigation while a multimedia layer is selected", () => {
		const composition = useStudioCompositionStore.getState();
		const sceneId = composition.selectedSceneId;
		if (!sceneId) {
			throw new Error("The Studio composition must select a scene");
		}
		composition.transact((project) =>
			addTextLayer(project, sceneId, { id: "selected-title", text: "A visual story" }),
		);
		composition.selectBlock(sceneId, "selected-title");

		render(<SceneInspector />);

		expect(screen.getByText("Layer controls for this scene.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Text" }).getAttribute("aria-pressed")).toBe("true");
		expect(screen.queryByRole("textbox", { name: /focus lines/i })).toBeNull();
		expect(screen.queryByRole("textbox", { name: /caption/i })).toBeNull();
	});
});
