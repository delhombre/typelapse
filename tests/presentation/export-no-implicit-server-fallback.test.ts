import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => false),
}));

function exportableSnippet(): Snippet {
	return Snippet.create({
		title: "Private project",
		code: "const first = true;",
		language: "typescript",
	})
		.addStep(Step.create({ code: "const first = true;" }))
		.addStep(Step.create({ code: "const second = true;" }));
}

describe("on-device export privacy", () => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState({ snippet: exportableSnippet() });
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
		vi.unstubAllGlobals();
	});

	it("does not upload or change target when WebCodecs cannot encode", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);

		await useExportStore.getState().exportVideo();

		const state = useExportStore.getState();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(state.target).toBe("device");
		expect(state.outcome).toEqual({
			kind: "failed",
			message:
				"This browser cannot encode the selected video on this device. Nothing was uploaded. Choose server rendering explicitly to continue.",
		});
	});
});
