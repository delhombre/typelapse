import { savedSentence } from "@/application/export/export-label";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sentence the export status speaks when a file is saved. The GIF's note
 * ("GIF: 960×540.") already ends with its own full stop, and the sentence put a
 * second one after it: "960×540..". Every format's note, as the store writes it,
 * ends the sentence with exactly one.
 */

let codecLabel: string | null = null;

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
	WebCodecsRendererAdapter: class {
		get lastMeasurements() {
			return { transparencyNote: null, codecLabel };
		}
		async renderVideo() {
			return new Blob(["video"], { type: "video/mp4" });
		}
		async renderStill() {
			return new Blob(["png"], { type: "image/png" });
		}
	},
}));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		async export() {}
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { add: async () => undefined, save: async () => undefined },
}));

function exportableSnippet(): Snippet {
	return Snippet.create({ title: "Saved", code: "const a = 1;", language: "typescript" })
		.addStep(Step.create({ code: "const a = 1;" }))
		.addStep(Step.create({ code: "const a = 2;" }));
}

function doneOutcome() {
	const outcome = useExportStore.getState().outcome;
	expect(outcome).toMatchObject({ kind: "done" });
	if (outcome?.kind !== "done") {
		throw new Error("the export did not finish");
	}
	return outcome;
}

beforeEach(() => {
	useExportStore.setState(useExportStore.getInitialState(), true);
	useSnippetStore.setState({
		snippet: exportableSnippet(),
		plan: { frames: [{ lineCount: 1, tokens: [] }], transitions: [] } as never,
	});
});

afterEach(() => {
	useExportStore.setState(useExportStore.getInitialState(), true);
	useSnippetStore.setState(useSnippetStore.getInitialState(), true);
	codecLabel = null;
});

describe("the sentence a saved export is announced with", () => {
	const VIDEOS = [
		{ format: "mp4", codec: "H.264 High" },
		{ format: "webm", codec: "VP9" },
		{ format: "gif", codec: null },
	] as const;

	for (const { format, codec } of VIDEOS) {
		it(`ends a ${format} export's note, and the sentence it joins, with exactly one full stop`, async () => {
			codecLabel = codec;
			useExportStore.setState({ width: 1920, height: 1080, format, target: "device" });

			await useExportStore.getState().exportVideo();

			const outcome = doneOutcome();
			expect(outcome.note).toBeDefined();
			expect(outcome.note).toMatch(/[^.]\.$/);
			const sentence = savedSentence(outcome);
			expect(sentence).toMatch(/[^.]\.$/);
			expect(sentence).not.toContain("..");
			expect(sentence).toContain(outcome.note ?? "");
		});
	}

	it("says what the GIF came out at, once", async () => {
		useExportStore.setState({ width: 1920, height: 1080, format: "gif", target: "device" });

		await useExportStore.getState().exportVideo();

		expect(savedSentence(doneOutcome())).toMatch(/GIF: .*960×540\.$/);
	});

	it("ends a png's note, and the sentence it joins, with exactly one full stop", async () => {
		await useExportStore.getState().exportPng();

		const outcome = doneOutcome();
		expect(outcome.note).toMatch(/^\d+×\d+\.$/);
		const sentence = savedSentence(outcome);
		expect(sentence).toMatch(/\d+×\d+\.$/);
		expect(sentence).not.toContain("..");
	});

	it("is still a sentence when the export has no note", () => {
		expect(
			savedSentence({
				filename: "clip.mp4",
				bytes: 2_500_000,
				elapsedMs: 3_000,
				target: "server",
			}),
		).toBe("Saved clip.mp4, 2.4 MB, in 3.0s on the server.");
	});
});
