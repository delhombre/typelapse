import type { RenderFormat } from "@/domain/entities/render-config";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* A browser that refuses one format may well encode another at the same size.
   The refusal used to stop at "choose the server", which sends the user to an
   upload when a format switch on this device would have done. */

const encodable = new Set<RenderFormat>();

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async (format: RenderFormat) => encodable.has(format)),
}));

function exportableSnippet(): Snippet {
	return Snippet.create({ title: "Ladder", code: "const a = 1;", language: "typescript" })
		.addStep(Step.create({ code: "const a = 1;" }))
		.addStep(Step.create({ code: "const a = 2;" }));
}

describe("a format this device cannot encode", () => {
	beforeEach(() => {
		encodable.clear();
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState({ snippet: exportableSnippet() });
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
		vi.unstubAllGlobals();
	});

	it("names the format that would render here, and uploads nothing", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		encodable.add("webm").add("gif");
		useExportStore.setState({ format: "mp4", target: "device" });

		await useExportStore.getState().exportVideo();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(useExportStore.getState().outcome).toEqual({
			kind: "failed",
			message:
				"This browser cannot encode MP4 on this device, but it can make a WebM. Nothing was uploaded. Switch the format to WebM, or choose server rendering explicitly.",
		});
	});

	it("offers a GIF only when no video format will encode", async () => {
		encodable.add("gif");
		useExportStore.setState({ format: "webm", target: "device" });

		await useExportStore.getState().exportVideo();

		const outcome = useExportStore.getState().outcome;
		expect(outcome?.kind === "failed" ? outcome.message : "").toContain("it can make a GIF");
	});
});
