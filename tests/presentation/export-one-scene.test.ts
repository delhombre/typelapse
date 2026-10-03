import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => false),
}));

function snippetWith(sceneCount: number): Snippet {
	let snippet = Snippet.create({ title: "Hold", code: "const a = 1;", language: "typescript" });
	for (let index = 0; index < sceneCount; index += 1) {
		snippet = snippet.addStep(Step.create({ code: `const a = ${index};`, duration: 2000 }));
	}
	return snippet;
}

describe("exporting a one-scene project", () => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
		vi.unstubAllGlobals();
	});

	it("goes on to render one scene instead of asking for a second", async () => {
		useSnippetStore.setState({ snippet: snippetWith(1) });

		await useExportStore.getState().exportVideo();

		// The device refusal is the render path speaking: the scene count let it through.
		expect(useExportStore.getState().outcome).toMatchObject({
			kind: "failed",
			message: expect.stringContaining("cannot encode"),
		});
	});

	it("still refuses a project with no scene at all", async () => {
		useSnippetStore.setState({ snippet: snippetWith(0) });

		await useExportStore.getState().exportVideo();

		expect(useExportStore.getState().outcome).toEqual({
			kind: "failed",
			message: "A video needs at least one scene.",
		});
	});
});
