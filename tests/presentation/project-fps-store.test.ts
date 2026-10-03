import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { readStudioProjectDocument } from "@/presentation/stores/studio-composition.store";
import { afterEach, describe, expect, it } from "vitest";

const FILE = {
	title: "Rate",
	code: "const a = 1;",
	language: "typescript",
	themeName: "nord",
	background: "mesh:ocean",
	steps: [{ code: "const a = 1;", duration: 1000 }],
};

describe("the frame rate in the studio's project file", () => {
	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
	});

	it("is saved with the project and in the draft payload", () => {
		useExportStore.getState().setFps(24);

		expect(readStudioProjectDocument().project.settings.fps).toBe(24);
		expect(useSnippetStore.getState().toProjectPayload().fps).toBe(24);
	});

	it("is restored when a file opens, and a file without one gets the default", () => {
		useSnippetStore.getState().importFromJson(JSON.stringify({ ...FILE, fps: 30 }));
		expect(useExportStore.getState().fps).toBe(30);

		useSnippetStore.getState().importFromJson(JSON.stringify(FILE));
		expect(useExportStore.getState().fps).toBe(60);
	});
});
