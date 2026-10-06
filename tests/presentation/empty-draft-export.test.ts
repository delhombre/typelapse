import { addTextLayer } from "@/application/project/multimedia-authoring";
import {
	STUDIO_LIVE_SCENE_ID,
	createStudioCompositionDocument,
} from "@/application/project/studio-composition";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	loadStudioCompositionDocument,
	readStudioCompositionSnapshot,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #168 follow-up: media on the live scene and an emptied editor. The code on
 * that scene is on no screen, so no route renders it: the server's, this
 * device's and the cloud's all answer with the sentence a project without a
 * scene gets.
 */

const { serverRender, deviceRender } = vi.hoisted(() => ({
	serverRender: vi.fn(async () => new Blob(["server"], { type: "video/mp4" })),
	deviceRender: vi.fn(async () => new Blob(["device"], { type: "video/mp4" })),
}));

vi.mock("@/infrastructure/export/local-multimedia-render-http.adapter", () => ({
	LocalMultimediaRenderHttpAdapter: class {
		render = serverRender;
	},
}));
vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
	WebCodecsRendererAdapter: class {
		lastMeasurements = null;
		renderVideo = deviceRender;
	},
}));
vi.mock("@/presentation/studio-media-runtime", () => ({
	studioLocalLibrary: { loadAsset: vi.fn() },
}));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		async export() {}
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { save: async () => undefined, add: async () => undefined },
}));

const NOTHING_TO_RENDER = "A video needs at least one scene.";

const submit = vi.fn(async () => undefined);

beforeEach(() => {
	submit.mockClear();
	vi.spyOn(useHostedRenderJobsStore.getState(), "submit").mockImplementation(submit);
	useExportStore.setState(useExportStore.getInitialState(), true);
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "media only",
			code: "const answer = 42;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [],
		}),
	);
	loadStudioCompositionDocument(
		createStudioCompositionDocument({
			...readStudioCompositionSnapshot(),
			projectId: "empty-draft-export",
		}),
	);
	useStudioCompositionStore
		.getState()
		.transact((project) =>
			addTextLayer(project, STUDIO_LIVE_SCENE_ID, { id: "export-title", text: "Hello" }),
		);
});

afterEach(() => {
	vi.restoreAllMocks();
	serverRender.mockClear();
	deviceRender.mockClear();
	useExportStore.setState(useExportStore.getInitialState(), true);
});

describe("rendering a project with media and no scene", () => {
	it("goes to the server while the editor holds code", async () => {
		useExportStore.setState({ target: "server", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(serverRender).toHaveBeenCalledTimes(1);
	});

	it("goes to the cloud while the editor holds code", async () => {
		useExportStore.setState({ target: "cloud", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(submit).toHaveBeenCalledTimes(1);
	});

	for (const target of ["server", "device", "cloud"] as const) {
		it(`is refused on ${target} while the editor is empty, and nothing is sent`, async () => {
			useExportStore.setState({ target, format: "mp4" });
			useSnippetStore.getState().setCode("");

			await useExportStore.getState().exportVideo();

			expect(useExportStore.getState().outcome).toEqual({
				kind: "failed",
				message: NOTHING_TO_RENDER,
			});
			expect(serverRender).not.toHaveBeenCalled();
			expect(deviceRender).not.toHaveBeenCalled();
			expect(submit).not.toHaveBeenCalled();
		});
	}
});
