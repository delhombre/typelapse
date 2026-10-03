import { previewCardPlacement } from "@/application/layout/canvas-fit";
import { fitScale } from "@/application/layout/fit-scale";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { synchronizeStudioCompositionStore } from "@/presentation/stores/studio-composition.store";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AVAILABLE = { width: 1200, height: 800 };

vi.mock("@/presentation/hooks/use-resize-observer", () => ({
	useResizeObserverNode: (node: Element | null) =>
		node ? ({ contentRect: AVAILABLE } as unknown as ResizeObserverEntry) : undefined,
}));

/** Every instant the preview asked the mesh to be painted at, in seconds. */
const meshTimes: number[] = [];
vi.mock("@/application/backgrounds/mesh-gradient", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/application/backgrounds/mesh-gradient")>();
	return {
		...actual,
		// A colour jsdom can read back (it drops stacked gradients), unique per call.
		meshGradientCss: (_preset: Parameters<typeof actual.meshGradientCss>[0], t: number) => {
			meshTimes.push(t);
			return `rgb(${meshTimes.length}, 0, 0)`;
		},
	};
});

const { LivePreview } = await import("@/presentation/components/preview/live-preview");

/** JetBrains Mono's advance: what a real canvas measures for the theme font. */
const ADVANCE = 0.6;
const DURATIONS = [2000, 1500, 2500];
const FG = "#e6edf3";
const token = (key: string, content: string, line: number, col: number) => ({
	key,
	content,
	line,
	col,
	color: FG,
});
const PLAN = {
	frames: [
		{
			lineCount: 3,
			tokens: [
				token("a", "function greet(name: string) {", 0, 0),
				token("b", "return name;", 1, 2),
				token("c", "}", 2, 0),
			],
		},
		{
			lineCount: 3,
			tokens: [
				token("a", "function greet(name: string) {", 0, 0),
				token("d", "return `Hi ${name}`;", 1, 2),
				token("c", "}", 2, 0),
			],
		},
		{ lineCount: 1, tokens: [token("e", 'console.log(greet("Typelapse"));', 0, 0)] },
	],
	transitions: [],
};

function stubCanvas() {
	const ctx = {
		font: "",
		measureText(text: string) {
			const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? "0");
			return { width: ADVANCE * size * text.length };
		},
	};
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		ctx as unknown as CanvasRenderingContext2D,
	);
}

async function loadProject() {
	useExportStore.setState({ width: 1920, height: 1080, transitionMs: 650 });
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "greet.ts",
			code: "function greet(name: string) {\n  return name;\n}",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [
				{ code: "function greet(name: string) {\n  return name;\n}", duration: DURATIONS[0] },
				{
					code: "function greet(name: string) {\n  return `Hi ${name}`;\n}",
					duration: DURATIONS[1],
				},
				{ code: 'console.log(greet("Typelapse"));', duration: DURATIONS[2] },
			],
		}),
	);
	// Laid out by hand: the highlighter is a browser bootstrap, and the preview
	// only needs where each token sits.
	useSnippetStore.setState({
		plan: PLAN as unknown as MagicMovePlan,
		isBuilding: false,
		background: "mesh:solar",
		currentStepIndex: 1,
		playback: null,
	});
	synchronizeStudioCompositionStore();
}

function renderPreview() {
	return render(
		<StudioVideoModeProvider active>
			<LivePreview />
		</StudioVideoModeProvider>,
	);
}

function grainLayers(root: Element): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>("[aria-hidden='true']")).filter(
		(el) => el.style.mixBlendMode === "soft-light",
	);
}

describe("LivePreview on the export canvas", () => {
	beforeEach(async () => {
		meshTimes.length = 0;
		stubCanvas();
		if (!window.matchMedia) {
			window.matchMedia = ((query: string) => ({
				matches: false,
				media: query,
				addEventListener() {},
				removeEventListener() {},
				addListener() {},
				removeListener() {},
				onchange: null,
				dispatchEvent: () => false,
			})) as unknown as typeof window.matchMedia;
		}
		await loadProject();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("lays the window out at the exporters' width and scales it at their text scale", () => {
		const { container } = renderPreview();
		const state = useSnippetStore.getState();
		const plan = state.plan;
		if (!plan) {
			throw new Error("the plan did not build");
		}
		const boxWidth = 1920 * fitScale(1920, 1080, AVAILABLE.width, AVAILABLE.height);
		const placement = previewCardPlacement({
			plan,
			chrome: state.windowChrome,
			fontSize: state.snippet.theme.fontSize,
			padding: state.framePadding,
			cardMargin: state.cardMargin,
			showLineNumbers: state.showLineNumbers,
			lineNumberStart: state.lineNumberStart,
			hasCaption: false,
			canvasWidth: 1920,
			canvasHeight: 1080,
			charWidthRatio: ADVANCE,
			boxWidth,
		});

		const card = container.querySelector<HTMLElement>("[data-export-target]");
		expect(Number.parseFloat(card?.style.width ?? "")).toBeCloseTo(
			placement.windowWidth + 2 * state.cardMargin,
			6,
		);
		const transform = card?.parentElement?.style.transform ?? "";
		const scale = Number.parseFloat(/scale\(([^)]+)\)/.exec(transform)?.[1] ?? "");
		expect(scale).toBeCloseTo(placement.cardScale, 6);
	});

	it("lays the grain over the whole canvas, never as a plate on the card", () => {
		const { container } = renderPreview();
		const card = container.querySelector("[data-export-target]");
		if (!card) {
			throw new Error("no card");
		}
		expect(grainLayers(card)).toHaveLength(0);
		const grain = grainLayers(container);
		expect(grain).toHaveLength(1);
		// Soft-light only blends inside its stacking context: under a transformed
		// ancestor it has nothing to blend with and paints as a flat veil, which is
		// what the plate was. Nothing between the grain and the canvas box may
		// transform.
		const box = card.parentElement?.parentElement;
		for (let el = grain[0]?.parentElement; el && el !== box; el = el.parentElement) {
			expect(el.style.transform).toBe("");
		}
		expect(grain[0]?.parentElement).toBe(box);
	});

	it("keeps the new mesh painted when the background changes", async () => {
		const { container } = renderPreview();
		await act(async () => {
			useSnippetStore.setState({ background: "mesh:aurora" });
		});
		const box = container.querySelector("[data-export-target]")?.parentElement?.parentElement;
		// The last colour handed out is what the box must still show: a cleanup
		// running after the repaint would leave it blank until the timeline moved.
		expect(box?.style.background).toBe(`rgb(${meshTimes.length}, 0, 0)`);
	});

	it("paints the mesh at the timeline's time, and holds it while paused", async () => {
		vi.useFakeTimers();
		try {
			renderPreview();
			// Scene 2 starts after scene 1's hold and the transition out of it.
			const sceneStart = ((DURATIONS[0] ?? 0) + 650) / 1000;
			expect(meshTimes.length).toBeGreaterThan(0);
			expect(meshTimes.at(-1)).toBeCloseTo(sceneStart, 6);

			const painted = meshTimes.length;
			await act(async () => {
				vi.advanceTimersByTime(1500);
			});
			// Paused: nothing repaints the mesh at any other instant.
			expect(meshTimes.slice(painted).every((t) => Math.abs(t - sceneStart) < 1e-6)).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
