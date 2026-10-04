import { useExportStore } from "@/presentation/stores/export.store";
import { afterEach, describe, expect, it, vi } from "vitest";

/* With Where set to Server, a multimedia project renders through the local
   Remotion route and the receipt says so. (With Where set to Device it now
   renders on this device: export-device-layers.test.ts.) */

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
// Hoisted: the store builds its download adapter when its module loads.
const { download, rememberCapture } = vi.hoisted(() => ({
	download: vi.fn(async () => undefined),
	rememberCapture: vi.fn(async () => undefined),
}));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		export = download;
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { save: async () => undefined, add: rememberCapture },
}));

describe("multimedia export receipt", () => {
	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		render.mockClear();
		download.mockClear();
		rememberCapture.mockClear();
	});

	it("says the server rendered it", async () => {
		useExportStore.setState({ target: "server", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(render).toHaveBeenCalledTimes(1);
		expect(useExportStore.getState().outcome).toMatchObject({ kind: "done", target: "server" });
	});

	it("shows a render error without downloading or claiming success", async () => {
		render.mockRejectedValueOnce(new Error("The local encoder stopped."));
		useExportStore.setState({ target: "server", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(useExportStore.getState().outcome).toEqual({
			kind: "failed",
			message: "The local encoder stopped.",
		});
		expect(download).not.toHaveBeenCalled();
		expect(rememberCapture).not.toHaveBeenCalled();
		expect(useExportStore.getState().isExporting).toBe(false);
	});

	it("does not claim success when the browser refuses to save the rendered file", async () => {
		download.mockRejectedValueOnce(new Error("The browser blocked the download."));
		useExportStore.setState({ target: "server", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(download).toHaveBeenCalledTimes(1);
		expect(useExportStore.getState().outcome).toEqual({
			kind: "failed",
			message: "The browser blocked the download.",
		});
		expect(rememberCapture).not.toHaveBeenCalled();
	});
});
