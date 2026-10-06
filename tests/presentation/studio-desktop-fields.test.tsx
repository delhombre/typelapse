import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { SceneDurationInput } from "@/presentation/components/ui/scene-duration-input";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The desktop studio's typed fields (ui pass 2026-10-05): a field that says
 * "done" on its key finishes on Enter, and a rejected entry says why in words
 * a screen reader hears, not only in a red border.
 */
describe("the studio's typed fields", () => {
	beforeEach(() => {
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) throw new Error("The template catalog must contain a project");
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useSnippetStore.getState().setCurrentStepIndex(0);
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	});

	afterEach(() => cleanup());

	it("finishes a duration on Enter, clamping what it typed", () => {
		const onCommit = vi.fn();
		render(<SceneDurationInput aria-label="Duration" durationMs={1_000} onCommit={onCommit} />);
		const field = screen.getByRole("textbox", { name: "Duration" });
		field.focus();
		fireEvent.change(field, { target: { value: "15" } });
		fireEvent.keyDown(field, { key: "Enter" });

		expect(document.activeElement).not.toBe(field);
		expect(onCommit).toHaveBeenLastCalledWith(10_000);
	});

	it("names a rejected focus range next to the field and clears it once fixed", () => {
		render(<SceneInspector />);
		const field = screen.getByRole("textbox", { name: "Scene 1 focus lines" });
		fireEvent.change(field, { target: { value: "lines two" } });
		fireEvent.blur(field);

		expect(field.getAttribute("aria-invalid")).toBe("true");
		const message = screen.getByText("Use line numbers, like 2-4, 7");
		expect(field.getAttribute("aria-describedby")).toBe(message.id);

		fireEvent.change(field, { target: { value: "2-3" } });
		expect(field.getAttribute("aria-invalid")).toBe("false");
		expect(screen.queryByText("Use line numbers, like 2-4, 7")).toBeNull();
	});

	it("keeps the add buttons for the scene, not for a layer being edited", () => {
		const composition = useStudioCompositionStore.getState();
		const sceneId = composition.selectedSceneId;
		if (!sceneId) throw new Error("The composition must select a scene");
		composition.transact((project) => addTextLayer(project, sceneId, { id: "title", text: "Hi" }));
		render(<SceneInspector />);
		expect(screen.getByRole("button", { name: "Capture" })).toBeTruthy();

		act(() => useStudioCompositionStore.getState().selectBlock(sceneId, "title"));
		expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Blank" })).toBeNull();
		expect(screen.getByRole("button", { name: "Text" }).getAttribute("aria-pressed")).toBe("true");
	});

	describe("the focus field", () => {
		const FIVE_LINES = "a();\nb();\nc();\nd();\ne();";

		function sceneWithFiveLines(focus?: string) {
			const project = TEMPLATE_CATALOG[0]?.project;
			if (!project) throw new Error("The template catalog must contain a project");
			useSnippetStore.getState().importFromJson(
				JSON.stringify({
					...project,
					code: FIVE_LINES,
					steps: [{ id: "five", code: FIVE_LINES, duration: 1_000, ...(focus ? { focus } : {}) }],
				}),
			);
			useSnippetStore.getState().setCurrentStepIndex(0);
			useStudioCompositionStore
				.getState()
				.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
		}

		function type(field: HTMLElement, value: string) {
			fireEvent.change(field, { target: { value } });
			fireEvent.blur(field);
		}

		it.each(["abc", "0", "5-2", "9"])("shows %s as invalid and keeps what was typed", (value) => {
			sceneWithFiveLines();
			render(<SceneInspector />);
			const field = screen.getByRole("textbox", { name: "Scene 1 focus lines" });
			type(field, value);

			expect(field.getAttribute("aria-invalid")).toBe("true");
			expect((field as HTMLInputElement).value).toBe(value);
			expect(useSnippetStore.getState().snippet.steps[0]?.highlightRanges).toEqual([]);
		});

		it("clamps 1-1000000 to the scene's five lines and says so in the field", () => {
			sceneWithFiveLines();
			render(<SceneInspector />);
			const field = screen.getByRole("textbox", { name: "Scene 1 focus lines" });
			type(field, "1-1000000");

			expect(field.getAttribute("aria-invalid")).toBe("false");
			expect((field as HTMLInputElement).value).toBe("1-5");
			const [range] = useSnippetStore.getState().snippet.steps[0]?.highlightRanges ?? [];
			expect([range?.startLine, range?.endLine]).toEqual([1, 5]);
		});

		it("opens a saved 2, 8-10 on five lines as it was saved, and a blur leaves it alone", () => {
			sceneWithFiveLines("2, 8-10");

			expect(useSnippetStore.getState().toProjectPayload().steps[0]?.focus).toBe("2, 8-10");
			render(<SceneInspector />);
			const field = screen.getByRole("textbox", { name: "Scene 1 focus lines" });
			expect((field as HTMLInputElement).value).toBe("2, 8-10");
			fireEvent.blur(field);

			expect(field.getAttribute("aria-invalid")).toBe("false");
			expect(useSnippetStore.getState().toProjectPayload().steps[0]?.focus).toBe("2, 8-10");
		});

		it("is the same field in the scene list, with the same invalid state", () => {
			Element.prototype.scrollIntoView = vi.fn();
			sceneWithFiveLines();
			render(<StepBuilder />);
			const field = screen.getByRole("textbox", { name: "Scene 1 focus lines" });
			type(field, "0");

			expect(field.getAttribute("aria-invalid")).toBe("true");
			expect((field as HTMLInputElement).value).toBe("0");
		});
	});
});
