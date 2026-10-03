import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A share link or a project file can carry any integer size, and the encoders
   take even ones only. The refusal used to escape the Render click as an
   unhandled rejection: no progress, no error, no file. */

const rendered: { width: number; height: number }[] = [];

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
	WebCodecsRendererAdapter: class {
		lastMeasurements = null;
		async renderVideo(_snippet: unknown, config: { width: number; height: number }) {
			rendered.push({ width: config.width, height: config.height });
			return new Blob(["video"], { type: "video/mp4" });
		}
	},
}));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		async export() {}
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { add: async () => undefined },
}));

function exportableSnippet(): Snippet {
	return Snippet.create({ title: "Odd", code: "const a = 1;", language: "typescript" })
		.addStep(Step.create({ code: "const a = 1;" }))
		.addStep(Step.create({ code: "const a = 2;" }));
}

describe("an odd export size", () => {
	beforeEach(() => {
		rendered.length = 0;
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState({ snippet: exportableSnippet(), plan: { frames: [] } as never });
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	});

	it("renders at the even size below it and says so, instead of doing nothing", async () => {
		useExportStore.setState({ width: 1081, height: 721, format: "mp4", target: "device" });

		await useExportStore.getState().exportVideo();

		expect(rendered).toEqual([{ width: 1080, height: 720 }]);
		const outcome = useExportStore.getState().outcome;
		expect(outcome).toMatchObject({ kind: "done", target: "device" });
		expect(outcome?.kind === "done" ? outcome.note : "").toContain("1080×720 (not 1081×721");
	});

	it("says nothing about the size when it was already even", async () => {
		useExportStore.setState({ width: 1920, height: 1080, format: "mp4", target: "device" });

		await useExportStore.getState().exportVideo();

		expect(rendered).toEqual([{ width: 1920, height: 1080 }]);
		const outcome = useExportStore.getState().outcome;
		expect(outcome?.kind === "done" ? (outcome.note ?? "") : "x").not.toContain("even sizes");
	});
});
