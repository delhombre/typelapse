import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #179: the on-device PNG keeps its caption band and bakes no caption into it,
 * as the on-device video does. The note says so for the still too, and only
 * when the project has a caption.
 */

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
	WebCodecsRendererAdapter: class {
		lastMeasurements = null;
		renderStill = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
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

function load(annotation: string | undefined) {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "still",
			code: "const a = 1;",
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [
				{ code: "const a = 1;", ...(annotation ? { caption: annotation } : {}) },
				{ code: "const a = 2;" },
			],
		}),
	);
	// The plan is built off the main thread; the still only reads it, and the
	// renderer here is a double, so a one-frame plan stands in.
	useSnippetStore.setState({
		plan: { frames: [{ lineCount: 1, tokens: [] }], transitions: [] } as never,
	});
}

async function pngNote(): Promise<string | undefined> {
	await useExportStore.getState().exportPng();
	const outcome = useExportStore.getState().outcome;
	expect(outcome).toMatchObject({ kind: "done" });
	return outcome?.kind === "done" ? outcome.note : undefined;
}

beforeEach(() => {
	useExportStore.setState(useExportStore.getInitialState(), true);
});

afterEach(() => {
	useExportStore.setState(useExportStore.getInitialState(), true);
});

describe("the PNG export note", () => {
	it("says captions are not baked on this device when a step has a caption", async () => {
		load("why the loop ends");
		expect(await pngNote()).toMatch(/^\d+×\d+\. Captions are not baked on this device yet\.$/);
	});

	it("is the size alone when the project has no caption", async () => {
		load(undefined);
		expect(await pngNote()).toMatch(/^\d+×\d+\.$/);
	});
});
