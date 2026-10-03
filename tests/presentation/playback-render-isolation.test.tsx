import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { locateStudioPlayback, visibleSceneIndex } from "@/application/studio-timeline/playback";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { useExportStore } from "@/presentation/stores/export.store";
import { studioPlaybackTimeline, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// The tooltip is a direct child of both the timeline's and the island's bodies,
// so its render count says whether a clock tick re-rendered either of them.
const tooltipRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/presentation/components/ui/studio-tooltip", () => ({
	StudioTooltip: ({ children }: { children: ReactElement }) => {
		tooltipRenders.count += 1;
		return children;
	},
	StudioTooltipProvider: ({ children }: { children: ReactElement }) => children,
}));

// Monaco itself never loads in jsdom; the stand-in counts the editor's renders.
const editorRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/presentation/components/editor/monaco-runtime", () => ({
	default: () => {
		editorRenders.count += 1;
		return <div data-testid="monaco" />;
	},
}));

beforeAll(() => {
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	Object.defineProperty(globalThis, "ResizeObserver", {
		configurable: true,
		value: ResizeObserverStub,
	});
});

function tenScenes(): void {
	let snippet = Snippet.create({ title: "Clock", code: "const a = 1;", language: "typescript" });
	for (let index = 0; index < 10; index++) {
		snippet = snippet.addStep(Step.create({ code: `const a = ${index};`, duration: 2000 }));
	}
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null, playbackProgress: 0 });
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
}

/** One rAF tick of `play()`: the same fields its `set` writes. */
function tick(elapsedMs: number): void {
	const timeline = studioPlaybackTimeline();
	if (!timeline) {
		throw new Error("ten scenes should play");
	}
	const position = locateStudioPlayback(timeline, elapsedMs);
	useSnippetStore.setState({
		isPlaying: true,
		playback: { phase: position.phase, index: position.index, t: position.t },
		playbackProgress: position.progress,
		playbackElapsedMs: position.elapsedMs,
		currentStepIndex: visibleSceneIndex(position, 10),
	});
}

describe("a playback tick", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
		useExportStore.setState({ transitionMs: 650, loop: false, width: 1920, height: 1080 });
		tenScenes();
	});

	afterEach(() => {
		useSnippetStore.setState({ isPlaying: false, playback: null });
		cleanup();
	});

	it("re-renders neither the timeline rows nor the island inside one scene", () => {
		const { container } = render(
			<>
				<StudioTimeline />
				<PreviewIsland variant="timeline" />
			</>,
		);
		act(() => tick(100));
		tooltipRenders.count = 0;

		// Sixty frames at 60 fps, all inside the first scene's hold.
		for (let frame = 1; frame <= 60; frame++) {
			act(() => tick(100 + frame * (1000 / 60)));
		}

		expect(tooltipRenders.count).toBe(0);
		// The playhead consumers still follow the clock.
		expect(container.querySelector(".studio-timeline-clock")?.textContent).toBe("00:01.1");
		expect(container.querySelector(".studio-timeline-bubble")?.textContent).toBe("00:01.1");
		const playhead = container.querySelector<HTMLElement>(".studio-timeline-playhead");
		expect(playhead?.style.getPropertyValue("--timeline-progress-shift")).not.toBe("");
		const fill = container.querySelector<HTMLElement>(".si-fill");
		expect(fill?.style.width).not.toBe("0%");
	});

	it("leaves the code editor alone", async () => {
		render(<CodeEditor />);
		await screen.findByTestId("monaco");
		act(() => tick(100));
		editorRenders.count = 0;

		for (let frame = 1; frame <= 60; frame++) {
			act(() => tick(100 + frame * (1000 / 60)));
		}

		expect(editorRenders.count).toBe(0);
	});

	it("still re-renders the timeline when the scene on screen changes", () => {
		render(<StudioTimeline />);
		act(() => tick(100));
		tooltipRenders.count = 0;

		act(() => tick(2000 + 650 + 100));

		expect(tooltipRenders.count).toBeGreaterThan(0);
		expect(document.querySelector(".studio-timeline-clip[data-selected]")).not.toBeNull();
	});
});
