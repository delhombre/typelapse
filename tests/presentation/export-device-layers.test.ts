import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Ticket #93: a project with text and image layers renders on this device.
   Ticket #94: so does one with a video layer in a container the worker reads;
   any other container is refused there in one sentence, the note says a sound
   the file does not carry, and nothing is posted to the local render route. */

const { document, serverRender, deviceRender, scenery } = vi.hoisted(() => ({
	document: { current: null as ProjectDocumentV2 | null },
	serverRender: vi.fn(async () => new Blob(["server"], { type: "video/mp4" })),
	deviceRender: vi.fn(async () => new Blob(["device"], { type: "video/mp4" })),
	scenery: { current: null as unknown },
}));

vi.mock("@/presentation/stores/studio-composition.store", () => ({
	hasAuthoredMultimedia: () => true,
	useStudioCompositionStore: { getState: () => ({ toDocument: () => document.current }) },
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
		constructor(value: unknown) {
			scenery.current = value;
		}
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

function documentWith(
	kind: "text" | "video",
	video: { mimeType?: string; muted?: boolean } = {},
): ProjectDocumentV2 {
	const base = { id: "layer", opacity: 1, placement: { x: 0, y: 0, width: 1, height: 1 } };
	const block =
		kind === "text"
			? {
					...base,
					kind,
					text: "Ship it",
					typography: {
						fontFamily: "Geist",
						fontSize: 88,
						fontWeight: 650,
						color: "#fff",
						align: "center" as const,
					},
				}
			: {
					...base,
					kind,
					assetId: "clip",
					fit: "cover" as const,
					focalPoint: { x: 0.5, y: 0.5 },
					trim: { startMs: 0, endMs: 1000 },
					playbackRate: 1,
					muted: video.muted ?? true,
				};
	return {
		schemaVersion: 2,
		project: {
			id: "p",
			title: "Story",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
			assets: [
				{
					id: "clip",
					kind: "video",
					fileName: "clip.avi",
					mimeType: video.mimeType ?? "video/mp4",
					byteSize: 10,
					checksum: "c".repeat(64),
					width: 1920,
					height: 1080,
					durationMs: 5000,
				},
			],
			audioCues: [],
			scenes: [{ id: "s", durationMs: 1000, blocks: [block] }],
		},
	};
}

describe("device export of a studio project with layers", () => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		const snippet = Snippet.create({
			title: "Story",
			code: "const a = 1;",
			language: "typescript",
		}).addStep(Step.create({ code: "const a = 1;", duration: 1000 }));
		useSnippetStore.setState({
			snippet,
			plan: { frames: [{ tokens: [], lineCount: 1 }], transitions: [], typing: [] } as never,
		});
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
		serverRender.mockClear();
		deviceRender.mockClear();
	});

	it("paints text layers on this device and posts nothing", async () => {
		document.current = documentWith("text");
		useExportStore.setState({ target: "device", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(serverRender).not.toHaveBeenCalled();
		expect(deviceRender).toHaveBeenCalledTimes(1);
		expect(scenery.current).toMatchObject({ composition: { document: document.current } });
		expect(useExportStore.getState().outcome).toMatchObject({ kind: "done", target: "device" });
	});

	it("draws a muted video layer on this device and posts nothing", async () => {
		document.current = documentWith("video");
		useExportStore.setState({ target: "device", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(serverRender).not.toHaveBeenCalled();
		expect(deviceRender).toHaveBeenCalledTimes(1);
		expect(scenery.current).toMatchObject({ composition: { document: document.current } });
		const outcome = useExportStore.getState().outcome;
		expect(outcome).toMatchObject({ kind: "done", target: "device" });
		expect((outcome?.kind === "done" && outcome.note) || "").not.toMatch(/audio/);
	});

	it("says the file has no sound when a video layer is not muted", async () => {
		document.current = documentWith("video", { muted: false });
		useExportStore.setState({ target: "device", format: "mp4" });

		await useExportStore.getState().exportVideo();

		const outcome = useExportStore.getState().outcome;
		expect(outcome).toMatchObject({ kind: "done", target: "device" });
		expect((outcome?.kind === "done" && outcome.note) || "").toContain(
			"No audio track on this device yet. Render on the server for sound",
		);
	});

	it("refuses a container this device cannot read in one sentence that offers the server", async () => {
		document.current = documentWith("video", { mimeType: "video/x-msvideo" });
		useExportStore.setState({ target: "device", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(serverRender).not.toHaveBeenCalled();
		expect(deviceRender).not.toHaveBeenCalled();
		expect(useExportStore.getState().outcome).toEqual({
			kind: "failed",
			message:
				"This device cannot read clip.avi; choose Server under Where to render this project.",
		});
	});

	it("sends the same project to the server when Where is Server", async () => {
		document.current = documentWith("video");
		useExportStore.setState({ target: "server", format: "mp4" });

		await useExportStore.getState().exportVideo();

		expect(deviceRender).not.toHaveBeenCalled();
		expect(serverRender).toHaveBeenCalledTimes(1);
	});
});
