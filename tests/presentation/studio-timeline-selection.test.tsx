import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { useExportStore } from "@/presentation/stores/export.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("StudioTimeline selection follow", () => {
	beforeEach(() => {
		scrollIntoView.mockClear();
		Element.prototype.scrollIntoView = scrollIntoView;
		for (const notice of useNoticeStore.getState().notices) {
			useNoticeStore.getState().dismiss(notice.id);
		}
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useSnippetStore.getState().setCurrentStepIndex(project.steps.length - 1);
		useStudioCompositionStore
			.getState()
			.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	});

	afterEach(() => cleanup());

	it("reveals a scene selected outside the film strip", async () => {
		render(<StudioTimeline />);

		await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
		expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("00:05.5, scene 3 of 3");
	});

	it("reveals scene-native actions for the selected clip", () => {
		render(<StudioTimeline />);

		expect(screen.getByText("Scene 3")).toBeTruthy();
		expect(screen.getByRole("spinbutton", { name: "Scene 3 duration in seconds" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Duplicate scene 3" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete scene 3" })).toBeTruthy();
	});

	it("adds a quiet capability mark only to scenes with authored layers", () => {
		const firstSceneId = useSnippetStore.getState().snippet.steps[0]?.id;
		if (!firstSceneId) {
			throw new Error("The template must contain a scene");
		}
		useStudioCompositionStore
			.getState()
			.transact((project) =>
				addTextLayer(project, firstSceneId, { id: "timeline-title", text: "Title" }),
			);

		const { container } = render(<StudioTimeline />);

		expect(container.querySelectorAll(".studio-timeline-layer-marks")).toHaveLength(1);
		expect(screen.getByRole("button", { name: /Scene 1,.*with text/ })).toBeTruthy();
	});

	it("edits the shared morph curve with the measured ui.camera presets", async () => {
		useExportStore.getState().setTransitionEasing([0.42, 0, 0.58, 1]);
		render(<StudioTimeline />);

		fireEvent.click(screen.getByRole("button", { name: "Edit transition easing" }));
		expect(screen.getByRole("dialog", { name: "Transition easing" })).toBeTruthy();
		expect(
			screen.getAllByRole("button", {
				name: /^(Linear|Ease|Ease in|Ease out|Ease in out|Smooth) easing$/,
			}),
		).toHaveLength(6);
		expect(
			(screen.getByRole("spinbutton", { name: "Cubic Bézier X1" }) as HTMLInputElement).value,
		).toBe("0.42");

		fireEvent.click(screen.getByRole("button", { name: "Smooth easing" }));
		expect(useExportStore.getState().transitionEasing).toEqual([0.22, 1, 0.36, 1]);

		fireEvent.keyDown(screen.getByRole("region", { name: "Animation timeline" }), {
			key: "Escape",
		});
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Transition easing" })).toBeNull();
		});
	});

	it("makes the real morph gaps explicit and edits their shared tempo in context", async () => {
		useExportStore.getState().setTransitionMs(650);
		render(<StudioTimeline />);

		const morphs = screen.getAllByRole("button", { name: /Morph between scene .*0\.65 seconds/ });
		expect(morphs).toHaveLength(2);

		fireEvent.click(morphs[0] as HTMLButtonElement);
		expect(screen.getByText("Morph 1 → 2")).toBeTruthy();
		expect(screen.getByText("Every transition")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Use snappy 0.4 second morphs" }));
		expect(useExportStore.getState().transitionMs).toBe(400);
		expect(
			screen.getAllByRole("button", { name: /Morph between scene .*0\.4 seconds/ }),
		).toHaveLength(2);

		fireEvent.keyDown(screen.getByRole("region", { name: "Animation timeline" }), {
			key: "Escape",
		});
		await waitFor(() => expect(screen.queryByText("Every transition")).toBeNull());
	});

	it("holds the scrubber at an exact transition frame instead of snapping to a clip", () => {
		useExportStore.getState().setTransitionMs(650);
		render(<StudioTimeline />);
		const slider = screen.getByRole("slider");

		fireEvent.change(slider, { target: { value: "185" } });

		expect(useSnippetStore.getState().playback?.phase).toBe("transition");
		expect(Number((slider as HTMLInputElement).value)).toBe(185);
	});

	it("supports a scoped delete shortcut without stealing keys from duration input", () => {
		render(<StudioTimeline />);
		const timeline = screen.getByRole("region", { name: "Animation timeline" });
		const duration = screen.getByRole("spinbutton", { name: "Scene 3 duration in seconds" });
		const before = useSnippetStore.getState().snippet.steps.length;

		fireEvent.keyDown(duration, { key: "Delete" });
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(before);

		fireEvent.keyDown(timeline, { key: "Delete" });
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(before - 1);
	});

	it("duplicates and navigates scenes with timeline-scoped shortcuts", () => {
		render(<StudioTimeline />);
		const timeline = screen.getByRole("region", { name: "Animation timeline" });
		const before = useSnippetStore.getState().snippet.steps.length;

		fireEvent.keyDown(screen.getByRole("button", { name: /Scene 3,/ }), {
			key: "d",
			metaKey: true,
		});
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(before + 1);
		expect(useSnippetStore.getState().currentStepIndex).toBe(3);

		fireEvent.keyDown(timeline, { key: "Home" });
		expect(useSnippetStore.getState().currentStepIndex).toBe(0);

		fireEvent.keyDown(timeline, { key: "End" });
		expect(useSnippetStore.getState().currentStepIndex).toBe(3);
	});

	it("reorders the selected scene from the timeline without a duplicate sidebar list", () => {
		render(<StudioTimeline />);
		const before = useSnippetStore.getState().snippet.steps.map((step) => step.id);
		const selected = before[2];
		if (!selected) {
			throw new Error("The template must contain three scenes");
		}

		fireEvent.keyDown(screen.getByRole("button", { name: /Scene 3,/ }), {
			key: "ArrowLeft",
			altKey: true,
		});

		const after = useSnippetStore.getState().snippet.steps.map((step) => step.id);
		expect(after[1]).toBe(selected);
		expect(after[2]).toBe(before[1]);
		expect(useSnippetStore.getState().currentStepIndex).toBe(1);
	});

	it("reorders scenes through the native drag surface while Motion animates the layout", () => {
		render(<StudioTimeline />);
		const before = useSnippetStore.getState().snippet.steps.map((step) => step.id);
		const moved = before[2];
		const source = screen.getByRole("button", { name: /Scene 3,/ }).parentElement;
		const target = screen.getByRole("button", { name: /Scene 1,/ }).parentElement;
		if (!moved || !source || !target) {
			throw new Error("The template must render three draggable scenes");
		}
		const dataTransfer = {
			effectAllowed: "none",
			dropEffect: "none",
			setData: vi.fn(),
		};

		fireEvent.dragStart(source, { dataTransfer });
		fireEvent.dragEnter(target, { dataTransfer });
		fireEvent.dragOver(target, { dataTransfer });
		fireEvent.drop(target, { dataTransfer });
		fireEvent.dragEnd(source, { dataTransfer });

		const after = useSnippetStore.getState().snippet.steps.map((step) => step.id);
		expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", moved);
		expect(after[0]).toBe(moved);
		expect(useSnippetStore.getState().currentStepIndex).toBe(0);
	});

	it("keeps scene actions available and replaces the undo target during rapid deletes", () => {
		render(<StudioTimeline />);
		const before = useSnippetStore.getState().snippet.steps;
		const firstRemoved = before[2];
		const secondRemoved = before[1];
		if (!firstRemoved || !secondRemoved) {
			throw new Error("The template must contain three scenes");
		}

		fireEvent.click(screen.getByRole("button", { name: "Delete scene 3" }));

		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).not.toContain(
			firstRemoved.id,
		);
		expect(screen.getByRole("region", { name: "Deleted scene 3" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete scene 2" })).toBeTruthy();
		expect(useNoticeStore.getState().notices).toHaveLength(0);

		fireEvent.click(screen.getByRole("button", { name: "Delete scene 2" }));
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).toEqual([
			before[0]?.id,
		]);
		expect(screen.queryByRole("button", { name: "Undo delete scene 3" })).toBeNull();
		expect(screen.getByRole("button", { name: "Undo delete scene 2" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete scene 1" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Undo delete scene 2" }));
		expect(useSnippetStore.getState().snippet.steps.map((step) => step.id)).toEqual([
			before[0]?.id,
			secondRemoved.id,
		]);
		expect(useSnippetStore.getState().currentStepIndex).toBe(1);
	});

	it("supports the familiar undo shortcut while the timeline owns focus", () => {
		render(<StudioTimeline />);
		const removed = useSnippetStore.getState().snippet.steps[2];
		if (!removed) {
			throw new Error("The template must contain three scenes");
		}

		fireEvent.click(screen.getByRole("button", { name: "Delete scene 3" }));
		fireEvent.keyDown(screen.getByRole("region", { name: "Animation timeline" }), {
			key: "z",
			metaKey: true,
		});

		expect(useSnippetStore.getState().snippet.steps[2]?.id).toBe(removed.id);
	});

	it("expires the local undo when a later timeline edit makes restoration ambiguous", async () => {
		render(<StudioTimeline />);

		fireEvent.click(screen.getByRole("button", { name: "Delete scene 3" }));
		expect(screen.getByRole("button", { name: "Undo delete scene 3" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Add scene" }));
		await waitFor(() => {
			expect(screen.queryByRole("button", { name: "Undo delete scene 3" })).toBeNull();
		});
	});
});
