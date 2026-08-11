import type { ProjectPayload } from "@/application/project/project-payload";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The gallery warns before it overwrites the user's work. "The user's work"
 * has to be defined honestly, or the confirm becomes noise people click through:
 * it fires when the studio holds something the user authored since the last
 * load, and stays silent otherwise, including on a freshly opened studio.
 */

const A_PROJECT: ProjectPayload = {
	title: "loaded.ts",
	code: "const a = 1;",
	language: "typescript",
	themeName: "nord",
	background: "mesh:ocean",
	steps: [
		{ code: "const a = 1;", duration: 1000 },
		{ code: "const a = 2;", duration: 1000 },
	],
};

function load(project: ProjectPayload): void {
	useSnippetStore.getState().importFromJson(JSON.stringify(project));
}

describe("hasUnsavedEdits", () => {
	it("is false on a freshly opened studio", () => {
		// Nothing has been typed yet: the default snippet is not the user's work.
		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
	});

	describe("after loading a project", () => {
		beforeEach(() => {
			load(A_PROJECT);
		});

		it("is false right after the load", () => {
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
		});

		it("is true once the code is edited", () => {
			useSnippetStore.getState().setCode("const a = 99;");
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(true);
		});

		it("is true once the title is edited", () => {
			useSnippetStore.getState().setTitle("mine.ts");
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(true);
		});

		it("is true once the backdrop is changed", () => {
			useSnippetStore.getState().setBackground("mesh:forest");
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(true);
		});

		it("is true once a step is captured", () => {
			useSnippetStore.getState().setCode("const a = 3;");
			useSnippetStore.getState().captureStep();
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(true);
		});

		it("is false again when the edit is undone by hand", () => {
			// Identical content is not an edit: warning about it would be a lie.
			useSnippetStore.getState().setCode("const a = 99;");
			useSnippetStore.getState().setCode("const a = 1;");
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
		});

		it("is false again after the next load replaces the edits", () => {
			// Loading re-baselines: two templates in a row must not warn on the second.
			useSnippetStore.getState().setCode("const a = 99;");
			load({ ...A_PROJECT, title: "other.ts" });
			expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
		});
	});
});
