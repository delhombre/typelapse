// @vitest-environment jsdom
import { Step } from "@/domain/entities/step";
import { FirstVideoCard } from "@/presentation/components/editor/first-video-card";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { useExportStore } from "@/presentation/stores/export.store";
import { useFirstVideoStore } from "@/presentation/stores/first-video.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	DEFAULT_FIRST_VIDEO_PREFERENCE,
	FIRST_VIDEO_STORAGE_KEY,
} from "@/presentation/utils/first-video-preference";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reduced motion: the card enters and leaves at once, so the tests need no clock.
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

/** A fresh studio: code in the editor, no scene, nothing remembered. */
function reset() {
	window.localStorage.clear();
	Element.prototype.scrollIntoView = vi.fn();
	useExportStore.setState({ outcome: null });
	useFirstVideoStore.setState({
		preference: DEFAULT_FIRST_VIDEO_PREFERENCE,
		completedAtLoad: false,
	});
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "T",
			code: "const a = 1;",
			language: "typescript",
			themeName: "nord",
			background: "mesh:ocean",
			steps: [],
		}),
	);
}

/** The project's scenes, replaced. */
function setScenes(steps: Step[]) {
	act(() => {
		const { snippet } = useSnippetStore.getState();
		const next = steps.reduce((current, step) => current.addStep(step), snippet);
		useSnippetStore.setState({ snippet: next, currentStepIndex: 0 });
	});
}

const bare = (code: string) => Step.create({ code });

function finishVideo(filename: string) {
	act(() => {
		useExportStore.setState({
			outcome: { kind: "done", filename, bytes: 1, target: "device", elapsedMs: 1 },
		});
	});
}

describe("the First video card", () => {
	beforeEach(reset);
	afterEach(cleanup);

	it("shows 0 of 3 and only the first step with one line on a fresh project", () => {
		render(<FirstVideoCard />);
		expect(screen.getByText("0 of 3")).toBeTruthy();
		expect(screen.getByText("Capture a scene")).toBeTruthy();
		expect(screen.getByText("Turn the code on screen into your first scene.")).toBeTruthy();
		expect(screen.queryByText("Add a focus or a caption")).toBeNull();
		expect(screen.queryByText("Render")).toBeNull();
	});

	it("ticks capture from the scene count and moves to the focus or caption step", () => {
		render(<FirstVideoCard />);
		setScenes([bare("a")]);
		expect(screen.getByText("1 of 3")).toBeTruthy();
		expect(screen.getByText("Add a focus or a caption")).toBeTruthy();
	});

	it("ticks the second step from a caption on any scene", () => {
		render(<FirstVideoCard />);
		setScenes([bare("a"), Step.create({ code: "b", annotation: "Why" })]);
		expect(screen.getByText("2 of 3")).toBeTruthy();
		expect(screen.getByText("Render")).toBeTruthy();
		expect(screen.getByText("Press Export, then Render, to get your video.")).toBeTruthy();
	});

	it("ticks the third step when a video finishes, and says so once all three hold", () => {
		render(<FirstVideoCard />);
		setScenes([Step.create({ code: "a", annotation: "Why" })]);
		finishVideo("t.mp4");
		expect(screen.getByText("3 of 3")).toBeTruthy();
		expect(screen.getByText("Your first video is made.")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /later/i })).toBeNull();
		// Recorded now; it leaves on the load after.
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toContain('"completed":true');
	});

	it("does not tick the third step for a PNG snapshot", () => {
		render(<FirstVideoCard />);
		setScenes([Step.create({ code: "a", annotation: "Why" })]);
		finishVideo("t.png");
		expect(screen.getByText("2 of 3")).toBeTruthy();
	});

	it("is gone from the load after its completion", () => {
		useFirstVideoStore.setState({
			preference: { dismissed: false, rendered: true, completed: true },
			completedAtLoad: true,
		});
		const { container } = render(<FirstVideoCard />);
		expect(container.querySelector(".fv-card")).toBeNull();
	});

	it("hides for good on Later, stored locally, and stays hidden on the next mount", async () => {
		const { container, unmount } = render(<FirstVideoCard />);
		fireEvent.click(screen.getByRole("button", { name: /^Later/ }));
		await waitFor(() => expect(container.querySelector(".fv-card")).toBeNull());
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toContain('"dismissed":true');
		unmount();
		const again = render(<FirstVideoCard />);
		expect(again.container.querySelector(".fv-card")).toBeNull();
	});

	it("never shows on a project with three scenes", () => {
		setScenes([bare("a"), bare("b"), bare("c")]);
		const { container } = render(<FirstVideoCard />);
		expect(container.querySelector(".fv-card")).toBeNull();
	});

	it("leaves by itself when the project reaches three scenes", async () => {
		const { container } = render(<FirstVideoCard />);
		expect(container.querySelector(".fv-card")).not.toBeNull();
		setScenes([bare("a"), bare("b"), bare("c")]);
		await waitFor(() => expect(container.querySelector(".fv-card")).toBeNull());
	});

	it("makes the step line a link only when the card can act on it", () => {
		const onRefine = vi.fn();
		const { rerender } = render(<FirstVideoCard onRefine={onRefine} />);
		// Capture is the fork's button, never a second control for the same act.
		expect(screen.queryByRole("button", { name: "Capture a scene" })).toBeNull();
		setScenes([bare("a")]);
		fireEvent.click(screen.getByRole("button", { name: "Add a focus or a caption" }));
		expect(onRefine).toHaveBeenCalledTimes(1);
		rerender(<FirstVideoCard />);
		expect(screen.queryByRole("button", { name: "Add a focus or a caption" })).toBeNull();
		expect(screen.getByText("Add a focus or a caption")).toBeTruthy();
	});

	it("adds no second filled control: Later is the only button and it is outlined", () => {
		const { container } = render(<FirstVideoCard />);
		const buttons = container.querySelectorAll("button");
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.className).toBe("fv-later");
	});

	it("names itself, and announces its count when a step ticks", () => {
		render(<FirstVideoCard />);
		expect(screen.getByRole("group", { name: "First video" })).toBeTruthy();
		const count = screen.getByText("0 of 3");
		expect(count.getAttribute("aria-live")).toBe("polite");
	});

	it("gives the Later button a name that starts with what it shows", () => {
		render(<FirstVideoCard />);
		const later = screen.getByRole("button", { name: /^Later/ });
		expect(later.getAttribute("aria-label")).toBe("Later: hide this card for good");
	});
});

describe("the First video card in the scene list", () => {
	beforeEach(reset);
	afterEach(cleanup);

	it("comes after the scene head and the fork, so it is not the first thing read", () => {
		const { container } = render(<StepBuilder />);
		const head = container.querySelector(".sc-scenes-head");
		const fork = container.querySelector(".sc-fork");
		const card = container.querySelector(".fv-card");
		expect(card).not.toBeNull();
		expect(head?.compareDocumentPosition(card as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(fork?.compareDocumentPosition(card as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it("takes the visitor to the selected scene's focus field from the step link", () => {
		setScenes([bare("const a = 1;")]);
		const { container } = render(<StepBuilder />);
		fireEvent.click(screen.getByRole("button", { name: "Add a focus or a caption" }));
		const id = useSnippetStore.getState().snippet.steps[0]?.id;
		expect(document.activeElement).toBe(container.querySelector(`#row-${id}-focus`));
	});

	it("leaves the fork's Capture as the zone's one filled shape", () => {
		const { container } = render(<StepBuilder />);
		expect(container.querySelectorAll('.sc-fork-action[data-kind="primary"]')).toHaveLength(1);
		expect(container.querySelectorAll(".fv-card button")).toHaveLength(1);
	});
});

describe("the First video card in the desktop's scene inspector", () => {
	beforeEach(reset);
	afterEach(cleanup);

	it("sits after the scene's head and hint, before its fields", () => {
		setScenes([bare("const a = 1;")]);
		const { container } = render(<SceneInspector />);
		const card = container.querySelector(".fv-card");
		const fields = container.querySelector(".sc-scene-fields");
		expect(card).not.toBeNull();
		expect(card?.compareDocumentPosition(fields as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it("takes the visitor to the scene's focus field from the step link", () => {
		setScenes([bare("const a = 1;")]);
		const { container } = render(<SceneInspector />);
		fireEvent.click(screen.getByRole("button", { name: "Add a focus or a caption" }));
		const id = useSnippetStore.getState().snippet.steps[0]?.id;
		expect(document.activeElement).toBe(container.querySelector(`#scene-${id}-focus`));
	});

	it("falls back to the caption for a scene with no code", () => {
		act(() => {
			useSnippetStore.getState().addBlankScene();
		});
		const { container } = render(<SceneInspector />);
		fireEvent.click(screen.getByRole("button", { name: "Add a focus or a caption" }));
		const id = useSnippetStore.getState().snippet.steps[0]?.id;
		expect(document.activeElement).toBe(container.querySelector(`#scene-${id}-caption`));
	});
});
