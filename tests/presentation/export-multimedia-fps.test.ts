import { useExportStore } from "@/presentation/stores/export.store";
import { afterEach, describe, expect, it, vi } from "vitest";

/* The fps chosen in the export panel is the fps of the multimedia file. It used
   to be forced to 30 unless it was 60. */

const render = vi.fn(async () => new Blob(["video"], { type: "video/mp4" }));

vi.mock("@/presentation/stores/studio-composition.store", () => ({
	hasAuthoredMultimedia: () => true,
	useStudioCompositionStore: {
		getState: () => ({
			toDocument: () => ({
				schemaVersion: 2,
				project: {
					id: "p",
					title: "Story",
					canvas: { width: 1920, height: 1080, background: "#111111" },
					assets: [],
					audioCues: [],
					scenes: [],
				},
			}),
		}),
	},
}));
vi.mock("@/infrastructure/export/local-multimedia-render-http.adapter", () => ({
	LocalMultimediaRenderHttpAdapter: class {
		render = render;
	},
}));
vi.mock("@/presentation/studio-media-runtime", () => ({ studioLocalLibrary: {} }));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		async export() {}
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { save: async () => undefined, add: async () => undefined },
}));

describe("multimedia export frame rate", () => {
	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		render.mockClear();
	});

	it.each([24, 30, 60])("renders at the %i fps chosen in the export panel", async (fps) => {
		useExportStore.setState({ target: "server", format: "mp4", fps });

		await useExportStore.getState().exportVideo();

		expect(render).toHaveBeenCalledWith(
			expect.objectContaining({ options: expect.objectContaining({ fps }) }),
		);
	});
});
