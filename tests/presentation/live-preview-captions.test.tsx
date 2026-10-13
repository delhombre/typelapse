import type { MagicMovePlan } from "@/application/magic-move/engine";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { synchronizeStudioCompositionStore } from "@/presentation/stores/studio-composition.store";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AVAILABLE = { width: 1200, height: 800 };

vi.mock("@/presentation/hooks/use-resize-observer", () => ({
	useResizeObserverNode: (node: Element | null) =>
		node ? ({ contentRect: AVAILABLE } as unknown as ResizeObserverEntry) : undefined,
}));

const { LivePreview } = await import("@/presentation/components/preview/live-preview");

/** JetBrains Mono's advance: what a real canvas measures for the theme font. */
const ADVANCE = 0.6;
const DURATIONS = [2000, 1500, 2500];
const CAPTION = "Before: a greeting";
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

async function loadProject(withCaptions = true) {
	useExportStore.setState({ width: 1920, height: 1080, transitionMs: 650 });
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "greet.ts",
			code: "function greet(name: string) {\n  return name;\n}",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [
				{
					code: "function greet(name: string) {\n  return name;\n}",
					duration: DURATIONS[0],
					...(withCaptions ? { caption: CAPTION } : {}),
				},
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
		currentStepIndex: 0,
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

/** The caption band the layout reserves in the frame: StepCaption's own box. */
function band(root: Element): HTMLElement | null {
	const card = root.querySelector("[data-export-target]");
	const span = Array.from(card?.querySelectorAll<HTMLElement>("span") ?? []).find((el) =>
		el.style.getPropertyValue("-webkit-line-clamp"),
	);
	return span?.parentElement?.parentElement ?? null;
}

function frameText(root: Element): string {
	return band(root)?.textContent ?? "";
}

function note(root: Element): HTMLElement | null {
	return root.querySelector<HTMLElement>("[data-testid=caption-note]");
}

describe("LivePreview shows what the chosen Where exports (#271)", () => {
	beforeEach(() => {
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
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		useExportStore.setState({ target: "device" });
	});

	it("passes no caption to the frame on this device, and says it under the frame", async () => {
		await loadProject();
		useExportStore.setState({ target: "device" });
		const { container } = renderPreview();

		expect(band(container)).not.toBeNull();
		expect(frameText(container)).toBe("");
		const line = note(container);
		expect(line?.textContent).toContain("Hosted only");
		expect(line?.textContent).toContain(CAPTION);
		// Outside what a snapshot or a loupe measures as the frame.
		expect(line?.closest("[data-export-target]")).toBeNull();
		expect(line?.closest("[data-preview-frame]")).toBeNull();
	});

	it.each(["server", "cloud"] as const)(
		"passes the caption to the frame for %s",
		async (target) => {
			await loadProject();
			useExportStore.setState({ target });
			const { container } = renderPreview();

			expect(frameText(container)).toBe(CAPTION);
			expect(note(container)).toBeNull();
		},
	);

	it("keeps the frame where it was when Where changes, and draws the caption at once for a baking target", async () => {
		await loadProject();
		useExportStore.setState({ target: "device" });
		const { container, rerender } = renderPreview();
		const card = container.querySelector<HTMLElement>("[data-export-target]");
		const before = {
			width: card?.style.width,
			bandHeight: band(container)?.style.height,
			margin: band(container)?.style.marginTop,
			transform: card?.parentElement?.style.transform,
		};

		useExportStore.setState({ target: "cloud" });
		rerender(
			<StudioVideoModeProvider active>
				<LivePreview />
			</StudioVideoModeProvider>,
		);

		const after = container.querySelector<HTMLElement>("[data-export-target]");
		expect(frameText(container)).toBe(CAPTION);
		expect({
			width: after?.style.width,
			bandHeight: band(container)?.style.height,
			margin: band(container)?.style.marginTop,
			transform: after?.parentElement?.style.transform,
		}).toEqual(before);
	});

	it("fades the caption out of the frame when Where goes back to this device, then takes it away", async () => {
		await loadProject();
		useExportStore.setState({ target: "cloud" });
		const { container, rerender } = renderPreview();
		expect(frameText(container)).toBe(CAPTION);

		useExportStore.setState({ target: "device" });
		rerender(
			<StudioVideoModeProvider active>
				<LivePreview />
			</StudioVideoModeProvider>,
		);

		// Still there for the fade, and the note already carries it.
		expect(note(container)?.textContent).toContain(CAPTION);
		await waitFor(() => expect(frameText(container)).toBe(""));
	});

	it("adds no line when the step has no caption", async () => {
		await loadProject(false);
		useExportStore.setState({ target: "device" });
		const { container } = renderPreview();

		expect(note(container)).toBeNull();
		expect(band(container)).toBeNull();
	});
});
