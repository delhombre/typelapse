import { useExportStore } from "@/presentation/stores/export.store";
import { afterEach, describe, expect, it, vi } from "vitest";

/* A multimedia project always renders through the local Remotion route,
   whatever "Where" is set to. The receipt used to echo the toggle and say
   "on this device" for a file whose media had just been posted to
   /api/render/v2. */

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

describe("multimedia export receipt", () => {
	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
	});

	it("says the server rendered it even when Where is set to Device", async () => {
		useExportStore.setState({ target: "device", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(render).toHaveBeenCalledTimes(1);
		expect(useExportStore.getState().outcome).toMatchObject({ kind: "done", target: "server" });
	});
});
