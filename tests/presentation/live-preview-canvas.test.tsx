import {
	BASE_VIDEO_SCALE,
	clipFades,
	previewCardPlacement,
	renderScaleFor,
} from "@/application/layout/canvas-fit";
import { fitScale } from "@/application/layout/fit-scale";
import { chromeBarHeight } from "@/application/layout/frame-metrics";
import type { MagicMovePlan } from "@/application/magic-move/engine";
import { ZOOM_SCALE, zoomOriginX } from "@/application/magic-move/focus-zoom";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
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
			captions: [],
			canvasWidth: 1920,
			canvasHeight: 1080,
			charWidthRatio: ADVANCE,
			boxWidth,
		});

		// Laid out at the exporters' size (#114): CSS rounds a line's baseline to
		// whole pixels of the size it lays out at, so a card laid out at editor size
		// and scaled 2.2x put each row on a 2.2 px grid, up to 1.1 px off the export.
		const unit = renderScaleFor(1920, 1080, BASE_VIDEO_SCALE);
		const card = container.querySelector<HTMLElement>("[data-export-target]");
		expect(Number.parseFloat(card?.style.width ?? "")).toBeCloseTo(
			(placement.windowWidth + 2 * state.cardMargin) * unit,
			6,
		);
		const transform = card?.parentElement?.style.transform ?? "";
		const scale = Number.parseFloat(/scale\(([^)]+)\)/.exec(transform)?.[1] ?? "");
		expect(scale).toBeCloseTo(placement.cardScale / unit, 6);
		// The code is set at the exporters' font size, so its line boxes round alike.
		// The code body is the window's one element with a line height in px.
		const code = Array.from(card?.querySelectorAll<HTMLElement>(".code-frame-glow div") ?? []).find(
			(el) => el.style.lineHeight.endsWith("px"),
		);
		expect(Number.parseFloat(code?.style.fontSize ?? "")).toBeCloseTo(
			state.snippet.theme.fontSize * unit,
			6,
		);
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

	it("cuts a line too long for the floor's columns in the code column, with the exporters' fade", async () => {
		const longLine = {
			frames: [{ lineCount: 1, tokens: [token("l", "x".repeat(10_000), 0, 0)] }],
			transitions: [],
		};
		useSnippetStore.setState({ plan: longLine as unknown as MagicMovePlan, currentStepIndex: 0 });
		const { container } = renderPreview();
		const state = useSnippetStore.getState();
		const placement = previewCardPlacement({
			plan: longLine,
			chrome: state.windowChrome,
			fontSize: state.snippet.theme.fontSize,
			padding: state.framePadding,
			cardMargin: state.cardMargin,
			showLineNumbers: state.showLineNumbers,
			lineNumberStart: state.lineNumberStart,
			captions: [],
			canvasWidth: 1920,
			canvasHeight: 1080,
			charWidthRatio: ADVANCE,
			boxWidth: 1920 * fitScale(1920, 1080, AVAILABLE.width, AVAILABLE.height),
		});
		expect(placement.clip).toEqual({ right: true, bottom: false });
		const clip = placement.lineClip;
		expect(clip?.visibleColumns).toBeGreaterThan(100);
		const unit = renderScaleFor(1920, 1080, BASE_VIDEO_SCALE);
		const windowEl = container.querySelector<HTMLElement>(".code-frame-glow");
		// The window's own fade, for whatever the push-in carries past its edge.
		const [fade] = clipFades({
			clip: placement.clip,
			windowWidth: placement.windowWidth,
			windowHeight: placement.windowHeight,
			chromeHeight: chromeBarHeight(state.windowChrome, 1),
			fontSize: state.snippet.theme.fontSize,
		});
		const fadeEl = windowEl?.querySelector<HTMLElement>("[data-clip-fade='right']");
		expect(Number.parseFloat(fadeEl?.style.width ?? "")).toBeCloseTo(
			(fade?.width ?? Number.NaN) * unit,
			6,
		);
		expect(Number.parseFloat(fadeEl?.style.top ?? "")).toBeCloseTo(
			(fade?.y ?? Number.NaN) * unit,
			6,
		);
		// And the code column's, over its last columns before the cut.
		const column = [...(windowEl?.querySelectorAll<HTMLElement>("span") ?? [])].find(
			(span) => span.textContent?.length === 10_000,
		)?.parentElement;
		expect(column?.style.maskImage).toBe(
			`linear-gradient(to right, #000 ${clip?.fadeStart}ch, transparent ${clip?.fadeEnd}ch)`,
		);
		expect(column?.parentElement?.style.overflow).toBe("hidden");
		expect(Number.parseFloat(windowEl?.style.maxHeight ?? "")).toBeCloseTo(
			placement.windowHeight * unit,
			6,
		);
	});

	it("pushes the code in under the chrome bar, never over it (#114)", async () => {
		useExportStore.setState({ focusZoom: true });
		// The plan is laid out by hand above; a focus edit must not rebuild it.
		useSnippetStore.setState({ rebuildPlan: async () => {} });
		const step = useSnippetStore.getState().snippet.steps[1];
		if (!step) {
			throw new Error("no second step");
		}
		useSnippetStore
			.getState()
			.updateStepFocus(step.id, [HighlightRange.create({ startLine: 2, endLine: 3 })]);
		const { container } = renderPreview();
		const scaled = Array.from(container.querySelectorAll<HTMLElement>("div")).find((el) =>
			el.style.transform.startsWith(`scale(${ZOOM_SCALE})`),
		);
		expect(scaled, "a pushed-in body").toBeDefined();
		// The box that scales does not clip: a clip that scales grows over the bar.
		expect(scaled?.style.overflow).not.toBe("hidden");
		const clip = scaled?.parentElement;
		expect(clip?.style.overflow).toBe("hidden");
		expect(clip?.style.transform).toBe("");
		expect(clip?.parentElement?.classList.contains("code-frame-glow")).toBe(true);
	});

	/** The pivot ratio the shared rule gives this plan's window on the 16:9 canvas. */
	function expectedOrigin(plan: unknown): number {
		const state = useSnippetStore.getState();
		const placement = previewCardPlacement({
			plan: plan as MagicMovePlan,
			chrome: state.windowChrome,
			fontSize: state.snippet.theme.fontSize,
			padding: state.framePadding,
			cardMargin: state.cardMargin,
			showLineNumbers: state.showLineNumbers,
			lineNumberStart: state.lineNumberStart,
			captions: [],
			canvasWidth: 1920,
			canvasHeight: 1080,
			charWidthRatio: ADVANCE,
			boxWidth: 1920 * fitScale(1920, 1080, AVAILABLE.width, AVAILABLE.height),
		});
		return zoomOriginX({ padding: state.framePadding, bodyWidth: placement.windowWidth });
	}

	it("pushes a window that cuts a long line in just left enough to keep its gutter, as the exporters do (#227)", async () => {
		useExportStore.setState({ focusZoom: true });
		useSnippetStore.setState({ rebuildPlan: async () => {} });
		const step = useSnippetStore.getState().snippet.steps[1];
		if (!step) {
			throw new Error("no second step");
		}
		useSnippetStore
			.getState()
			.updateStepFocus(step.id, [HighlightRange.create({ startLine: 1, endLine: 1 })]);
		const longLine = {
			frames: [
				{ lineCount: 1, tokens: [token("l", "x".repeat(300), 0, 0)] },
				{ lineCount: 1, tokens: [token("l", "x".repeat(300), 0, 0)] },
			],
			transitions: [],
		};
		useSnippetStore.setState({ plan: longLine as unknown as MagicMovePlan });
		const { container } = renderPreview();
		const scaled = Array.from(container.querySelectorAll<HTMLElement>("div")).find((el) =>
			el.style.transform.startsWith(`scale(${ZOOM_SCALE})`),
		);
		expect(scaled, "a pushed-in body").toBeDefined();
		const origin = expectedOrigin(longLine);
		expect(origin).toBeLessThan(0.1);
		expect(Number.parseFloat(scaled?.style.transformOrigin ?? "") / 100).toBeCloseTo(origin, 9);
		expect(container.querySelector("[data-push-in-fade]")).toBeNull();
	});

	it("pushes a window whose lines fit in left of centre too, and fades its right edge", async () => {
		useExportStore.setState({ focusZoom: true });
		useSnippetStore.setState({ rebuildPlan: async () => {} });
		const step = useSnippetStore.getState().snippet.steps[1];
		if (!step) {
			throw new Error("no second step");
		}
		useSnippetStore
			.getState()
			.updateStepFocus(step.id, [HighlightRange.create({ startLine: 2, endLine: 3 })]);
		const { container } = renderPreview();
		const scaled = Array.from(container.querySelectorAll<HTMLElement>("div")).find((el) =>
			el.style.transform.startsWith(`scale(${ZOOM_SCALE})`),
		);
		const origin = expectedOrigin(PLAN);
		expect(origin).toBeGreaterThan(0);
		expect(origin).toBeLessThanOrEqual(0.5);
		expect(Number.parseFloat(scaled?.style.transformOrigin ?? "") / 100).toBeCloseTo(origin, 9);
		// The right edge takes what the push-in carries off: it fades, outside the scaled box.
		const fade = container.querySelector<HTMLElement>("[data-push-in-fade]");
		expect(fade?.style.opacity).toBe("1");
		expect(scaled?.contains(fade ?? null)).toBe(false);
		expect(container.querySelector("[data-clip-fade='right']")).toBeNull();
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
