import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { useExportStore } from "@/presentation/stores/export.store";
import { studioPlaybackTimeline, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	loadStudioCompositionDocument,
	readStudioProjectDocument,
	synchronizeStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { restoreBlankStudioProject } from "@/presentation/utils/studio-project-replacement";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Ticket #129: the composition keeps the render settings it was loaded with.
   A setting changed after the load (the watermark, the tempo, the progress bar)
   must reach the server route, the device painter and the preview clock exactly
   as the saved document carries it, or the file and the preview disagree. */

const { serverDocument, deviceInput, library } = vi.hoisted(() => ({
	serverDocument: { current: null as ProjectDocumentV2 | null },
	deviceInput: { current: null as { composition: { document: ProjectDocumentV2 } | null } | null },
	library: {
		loadProject: vi.fn(),
		moveProject: vi.fn(),
		loadAsset: vi.fn(),
		saveProject: vi.fn(),
	},
}));

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	return {
		studioLocalLibrary: library,
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: { create: vi.fn() },
	};
});
vi.mock("@/infrastructure/export/local-multimedia-render-http.adapter", () => ({
	LocalMultimediaRenderHttpAdapter: class {
		async render(input: { document: ProjectDocumentV2 }) {
			serverDocument.current = input.document;
			return new Blob(["server"], { type: "video/mp4" });
		}
	},
}));
vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
	WebCodecsRendererAdapter: class {
		lastMeasurements = null;
		constructor(value: never) {
			deviceInput.current = value;
		}
		renderVideo = async () => new Blob(["device"], { type: "video/mp4" });
	},
}));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		async export() {}
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { save: async () => undefined, add: async () => undefined },
}));

const LOCAL_PROJECT_ID = "3f0c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

/** A two-scene project with a text layer, loaded the way a file opens. */
function loadLayeredProject(): void {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "Story",
			code: "const b = 2;",
			language: "typescript",
			themeName: "midnight",
			background: "#111111",
			watermark: "loaded.dev",
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

/** Every render setting changed after the load, as the panel would. */
function changeSettingsAfterLoad(): void {
	useSnippetStore.getState().setWatermark("changed.dev");
	useExportStore.getState().setTransitionMs(1000);
	useExportStore.getState().setProgressStyle("bar");
	useExportStore.getState().setLoop(true);
	// The bridge reconciles on every Studio change.
	synchronizeStudioCompositionStore();
}

describe("render settings changed after a load", () => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		serverDocument.current = null;
		deviceInput.current = null;
		loadLayeredProject();
		useSnippetStore.setState({
			plan: { frames: [{ tokens: [], lineCount: 1 }], transitions: [], typing: [] } as never,
		});
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	});

	it("reach the multimedia server route as the saved document carries them", async () => {
		changeSettingsAfterLoad();
		useExportStore.setState({ target: "server", format: "mp4" });

		await useExportStore.getState().exportVideo();

		const saved = readStudioProjectDocument();
		expect(saved.project.settings).toMatchObject({
			watermark: "changed.dev",
			transitionMs: 1000,
			progressStyle: "bar",
		});
		expect(serverDocument.current?.project.settings).toEqual(saved.project.settings);
		expect(serverDocument.current?.project.legacySource).toEqual(saved.project.legacySource);
	});

	it("reach the device painter's composition as the saved document carries them", async () => {
		changeSettingsAfterLoad();
		useExportStore.setState({ target: "device", format: "mp4" });

		await useExportStore.getState().exportVideo();

		const saved = readStudioProjectDocument();
		expect(deviceInput.current?.composition?.document.project.settings).toEqual(
			saved.project.settings,
		);
	});

	it("time the preview clock as the saved document does, loop morph included", () => {
		changeSettingsAfterLoad();

		const saved = compileSceneTimeline({
			document: readStudioProjectDocument(),
			fps: useExportStore.getState().fps,
			loop: true,
		});
		expect(studioPlaybackTimeline()?.totalMs).toBe(saved.durationMs);
	});
});
