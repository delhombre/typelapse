import type { MagicMovePlan } from "@/application/magic-move/engine";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { StudioVideoModeProvider } from "@/presentation/contexts/studio-video-mode";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	loadStudioCompositionDocument,
	readStudioProjectDocument,
	synchronizeStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { restoreBlankStudioProject } from "@/presentation/utils/studio-project-replacement";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Ticket #129: the preview draws the layers from the composition, whose render
   settings are the ones it was loaded with. With loop on, the loop morph lasts
   the project's tempo; a tempo chosen after the load must time the preview's
   layers as it times the saved document, which is what every export renders. */

vi.mock("@/presentation/hooks/use-resize-observer", () => ({
	useResizeObserverNode: (node: Element | null) =>
		node
			? ({ contentRect: { width: 1200, height: 800 } } as unknown as ResizeObserverEntry)
			: undefined,
}));
vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	return {
		studioLocalLibrary: {
			loadProject: vi.fn(),
			moveProject: vi.fn(),
			loadAsset: vi.fn(),
			saveProject: vi.fn(),
		},
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: { create: vi.fn() },
	};
});

const { LivePreview } = await import("@/presentation/components/preview/live-preview");

const LOCAL_PROJECT_ID = "3f0c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const FG = "#e6edf3";
const PLAN = {
	frames: [
		{ lineCount: 1, tokens: [{ key: "a", content: "const a = 1;", line: 0, col: 0, color: FG }] },
		{ lineCount: 1, tokens: [{ key: "b", content: "const b = 2;", line: 0, col: 0, color: FG }] },
	],
	transitions: [],
};

function stubCanvas() {
	const ctx = {
		font: "",
		measureText(text: string) {
			const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? "0");
			return { width: 0.6 * size * text.length };
		},
	};
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		ctx as unknown as CanvasRenderingContext2D,
	);
}

/** Two scenes, a text layer on the first, loaded the way a file opens. */
function loadLayeredProject(): void {
	useExportStore.setState({ width: 1920, height: 1080, transitionMs: 650, loop: true });
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "Story",
			code: "const b = 2;",
			language: "typescript",
			themeName: "midnight",
			background: "#111111",
			steps: [
				{ code: "const a = 1;", duration: 1000 },
				{ code: "const b = 2;", duration: 1000 },
			],
		}),
	);
	restoreBlankStudioProject(LOCAL_PROJECT_ID);
	const document = readStudioProjectDocument();
	const [first, ...rest] = document.project.scenes;
	if (!first) throw new Error("Expected a scene");
	loadStudioCompositionDocument({
		...document,
		project: {
			...document.project,
			scenes: [
				{
					...first,
					blocks: [
						...first.blocks,
						{
							id: "caption-layer",
							kind: "text",
							text: "Ship it",
							opacity: 1,
							placement: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 },
							typography: {
								fontFamily: "Geist",
								fontSize: 88,
								fontWeight: 650,
								color: "#ffffff",
								align: "center",
							},
						},
					],
				},
				...rest,
			],
		},
	});
}

describe("the preview's layers after a tempo change", () => {
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
		loadLayeredProject();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	});

	it("fade the loop morph as the saved document does", () => {
		useExportStore.getState().setTransitionMs(1000);
		// The bridge reconciles on every Studio change.
		synchronizeStudioCompositionStore();
		// Inside the loop morph: two 1 s scenes, a 1 s morph, then 0.8 s of the loop back.
		const elapsedMs = 3_800;
		useSnippetStore.setState({
			plan: PLAN as unknown as MagicMovePlan,
			isBuilding: false,
			isPlaying: false,
			playback: { phase: "loop", index: 1, t: 0.8 },
			playbackElapsedMs: elapsedMs,
		});

		const { container } = render(
			<StudioVideoModeProvider active>
				<LivePreview />
			</StudioVideoModeProvider>,
		);

		const { fps } = useExportStore.getState();
		const expected = compileSceneTimeline({
			document: readStudioProjectDocument(),
			fps,
			loop: true,
		})
			.frameAt(Math.round((elapsedMs / 1_000) * fps))
			.layers.find((layer) => layer.blockId === "caption-layer");
		const layer = container.querySelector<HTMLElement>("[data-kind='text']");
		expect(expected).toBeDefined();
		expect(Number.parseFloat(layer?.style.opacity ?? "")).toBeCloseTo(expected?.opacity ?? -1, 6);
	});
});
