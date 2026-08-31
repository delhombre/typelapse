import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
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
	});

	afterEach(() => cleanup());

	it("reveals the selected card when selection comes from the timeline", async () => {
		render(<StepBuilder />);

		await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
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
});
