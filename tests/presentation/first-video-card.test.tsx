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

	it("is not there on an empty project: the fork already says to capture", () => {
		const { container } = render(<FirstVideoCard />);
		expect(container.querySelector(".fv-card")).toBeNull();
	});

	it("appears at 1 of 3 once a scene is captured, with only the next step and one line", () => {
		render(<FirstVideoCard />);
		setScenes([bare("a")]);
		expect(screen.getByText("1 of 3")).toBeTruthy();
		expect(screen.getByText("Add a focus or a caption")).toBeTruthy();
		expect(screen.getByText("Pick the lines to spotlight, or write a short caption.")).toBeTruthy();
		expect(screen.queryByText("Capture a scene")).toBeNull();
		expect(screen.queryByText("Render")).toBeNull();
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
		expect(screen.getByRole("status", { name: "" }).textContent).toBe("Your first video is made.");
		expect(screen.queryByRole("button", { name: /later/i })).toBeNull();
		// Recorded now; it leaves on the load after.
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toContain('"completed":true');
	});

	it("lets the completed card be put away with Done, for good", async () => {
		const { container } = render(<FirstVideoCard />);
		setScenes([Step.create({ code: "a", annotation: "Why" })]);
		finishVideo("t.mp4");
		fireEvent.click(screen.getByRole("button", { name: "Done" }));
		await waitFor(() => expect(container.querySelector(".fv-card")).toBeNull());
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toContain('"dismissed":true');
	});

	it("does not tick the third step for a PNG snapshot", () => {
		render(<FirstVideoCard />);
		setScenes([Step.create({ code: "a", annotation: "Why" })]);
		finishVideo("t.png");
		expect(screen.getByText("2 of 3")).toBeTruthy();
	});

	it("is gone from the load after its completion", () => {
		setScenes([bare("a")]);
		useFirstVideoStore.setState({
			preference: { dismissed: false, rendered: true, completed: true },
			completedAtLoad: true,
		});
		const { container } = render(<FirstVideoCard />);
		expect(container.querySelector(".fv-card")).toBeNull();
	});

	it("hides for good on Later, stored locally, and stays hidden on the next mount", async () => {
		setScenes([bare("a")]);
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
		setScenes([bare("a")]);
		const { container } = render(<FirstVideoCard />);
		expect(container.querySelector(".fv-card")).not.toBeNull();
		setScenes([bare("a"), bare("b"), bare("c")]);
		await waitFor(() => expect(container.querySelector(".fv-card")).toBeNull());
	});

	it("makes the step line a link only when the card can act on it", () => {
		const onRefine = vi.fn();
		setScenes([bare("a")]);
		const { rerender } = render(<FirstVideoCard onRefine={onRefine} />);
		fireEvent.click(screen.getByRole("button", { name: "Add a focus or a caption" }));
		expect(onRefine).toHaveBeenCalledTimes(1);
		rerender(<FirstVideoCard />);
		expect(screen.queryByRole("button", { name: "Add a focus or a caption" })).toBeNull();
		expect(screen.getByText("Add a focus or a caption")).toBeTruthy();
	});

	it("never links Render: opening the export panel is the island's", () => {
		render(<FirstVideoCard onRefine={() => undefined} />);
		setScenes([Step.create({ code: "a", annotation: "Why" })]);
		expect(screen.getByText("Render")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Render" })).toBeNull();
	});

	it("adds no second filled control: Later is the only button and it is outlined", () => {
		setScenes([bare("a")]);
		const { container } = render(<FirstVideoCard />);
		const buttons = container.querySelectorAll("button");
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.className).toBe("fv-later");
	});

	it("names itself and says what its count counts", () => {
		setScenes([bare("a")]);
		render(<FirstVideoCard />);
		expect(screen.getByRole("group", { name: "First video" })).toBeTruthy();
		expect(screen.getByText("steps done")).toBeTruthy();
	});

	it("announces a tick with the step that is next, and reads quietly on mount", () => {
		setScenes([bare("a")]);
		const { container } = render(<FirstVideoCard />);
		const live = container.querySelector("[aria-live='polite']");
		expect(live?.textContent).toBe("1 of 3 steps done. Next: Add a focus or a caption");
		setScenes([Step.create({ code: "b", annotation: "Why" })]);
		expect(container.querySelector("[aria-live='polite']")).toBe(live);
		expect(live?.textContent).toContain("Next: Render");
	});

	it("gives the Later button a name that starts with what it shows", () => {
		setScenes([bare("a")]);
		render(<FirstVideoCard />);
		const later = screen.getByRole("button", { name: /^Later/ });
		expect(later.getAttribute("aria-label")).toBe("Later: hide this card for good");
	});
});

describe("the First video card in the scene list", () => {
	beforeEach(reset);
	afterEach(cleanup);

	it("is not drawn beside the fork on an empty project", () => {
		const { container } = render(<StepBuilder />);
		expect(container.querySelector(".sc-fork")).not.toBeNull();
		expect(container.querySelector(".fv-card")).toBeNull();
	});

	it("comes after the scene head, so it is not the first thing read, and before the list", () => {
		setScenes([bare("const a = 1;")]);
		const { container } = render(<StepBuilder />);
		const head = container.querySelector(".sc-scenes-head");
		const list = container.querySelector(".sc-scene-list");
		const card = container.querySelector(".fv-card");
		expect(card).not.toBeNull();
		expect(head?.compareDocumentPosition(card as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(card?.compareDocumentPosition(list as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});

	it("takes the visitor to the selected scene's focus field from the step link", () => {
		setScenes([bare("const a = 1;")]);
		const { container } = render(<StepBuilder />);
		fireEvent.click(screen.getByRole("button", { name: "Add a focus or a caption" }));
		const id = useSnippetStore.getState().snippet.steps[0]?.id;
		expect(document.activeElement).toBe(container.querySelector(`#row-${id}-focus`));
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
