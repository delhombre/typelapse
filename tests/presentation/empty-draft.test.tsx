import type { MagicMovePlan } from "@/application/magic-move/engine";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { synchronizeStudioCompositionStore } from "@/presentation/stores/studio-composition.store";
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

vi.mock("@/presentation/hooks/use-resize-observer", () => ({
	useResizeObserverNode: (node: Element | null) =>
		node
			? ({ contentRect: { width: 1200, height: 800 } } as unknown as ResizeObserverEntry)
			: undefined,
}));

/**
 * #168, D2: an emptied editor is a draft the store holds beside the snippet.
 * What the person sees while it is empty: an empty card in the preview, and a
 * Capture that does nothing because there is nothing on screen to capture.
 */

const CODE = "const answer = 42;";

/** The plan the highlighter would lay out for CODE, by hand: it is a browser bootstrap. */
const CODE_PLAN = {
	frames: [
		{
			lineCount: 1,
			tokens: [{ key: "a", content: CODE, line: 0, col: 0, color: "#e6edf3" }],
		},
	],
	transitions: [],
} as unknown as MagicMovePlan;

function load(steps: { code: string; duration: number }[]) {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "draft",
			code: CODE,
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps,
		}),
	);
	useSnippetStore.setState({ plan: CODE_PLAN, isBuilding: false, playback: null });
	synchronizeStudioCompositionStore();
}

beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		font: "",
		measureText: (text: string) => ({ width: 8 * text.length }),
	} as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("the preview while the editor is empty", () => {
	function renderPreview() {
		return render(
			<StudioVideoModeProvider active>
				<LivePreview />
			</StudioVideoModeProvider>,
		);
	}

	it("draws the card and none of the code that was there", () => {
		load([]);
		const { container } = renderPreview();
		expect(container.textContent).toContain("answer");

		act(() => useSnippetStore.getState().setCode(""));

		expect(container.querySelector("[data-export-target]")).not.toBeNull();
		expect(container.querySelector(".code-frame-glow")).not.toBeNull();
		expect(container.textContent).not.toContain("answer");
		expect(container.textContent).not.toContain("Write code to see the preview");
	});

	it("brings the code back, in the same card, when something is typed again", () => {
		load([]);
		const { container } = renderPreview();
		act(() => useSnippetStore.getState().setCode(""));

		act(() => {
			useSnippetStore.getState().setCode(CODE);
			useSnippetStore.setState({ plan: CODE_PLAN, isBuilding: false });
		});

		expect(container.textContent).toContain("answer");
	});
});

describe("Capture while the editor is empty", () => {
	it("is off in the scene inspector, and on again with code", () => {
		load([]);
		render(<SceneInspector />);
		// With code and no scene the fork's Capture is the one control (the head's steps aside).
		const forkCapture = screen.getByRole("button", { name: "Capture this code" });
		expect((forkCapture as HTMLButtonElement).disabled).toBe(false);
		expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();

		act(() => useSnippetStore.getState().setCode(""));
		const capture = screen.getByRole("button", { name: "Capture" }) as HTMLButtonElement;
		expect(capture.disabled).toBe(true);
		expect(screen.getByText("Write some code to capture.")).toBeTruthy();

		act(() => useSnippetStore.getState().setCode("const b = 2;"));
		expect(screen.getByRole("button", { name: "Capture this code" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
	});

	it("is off in the phone's scene list", () => {
		load([]);
		render(<StepBuilder />);

		act(() => useSnippetStore.getState().setCode(""));

		expect((screen.getByRole("button", { name: "Capture" }) as HTMLButtonElement).disabled).toBe(
			true,
		);
	});

	it("is off on the timeline's Add scene, which captures the editor too", () => {
		load([{ code: CODE, duration: 1000 }]);
		render(<StudioTimeline />);

		act(() => useSnippetStore.getState().setCode(""));
		const add = screen.getByRole("button", { name: "Add scene" }) as HTMLButtonElement;
		expect(add.disabled).toBe(true);

		fireEvent.click(add);
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(1);
	});
});
