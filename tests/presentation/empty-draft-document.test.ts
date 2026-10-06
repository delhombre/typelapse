import { addTextLayer } from "@/application/project/multimedia-authoring";
import { STUDIO_LIVE_SCENE_ID } from "@/application/project/studio-composition";
import { applyStudioProjectDocument } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	studioDocumentOf,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * #168 follow-up: an emptied editor is on no screen, so it is on no document
 * either. A project with media and no scene keeps its code on the live scene;
 * emptying the editor must empty that scene, or the saved file and the
 * server's video carry code the preview no longer shows.
 */

const OLD_CODE = "const staleAnswer = 42;";
const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-const a = 1
+const a = 2
 const b = 3
`;

let layerCount = 0;

function openMediaOnly() {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "media only",
			code: OLD_CODE,
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [],
		}),
	);
	synchronizeStudioCompositionStore();
	useStudioCompositionStore
		.getState()
		.transact((project) =>
			addTextLayer(project, STUDIO_LIVE_SCENE_ID, { id: `title-${layerCount++}`, text: "Hello" }),
		);
}

describe("an emptied editor on a project with media and no scene", () => {
	beforeEach(openMediaOnly);

	it("starts from a live scene that carries the code", () => {
		expect(hasAuthoredMultimedia()).toBe(true);
		expect(readStudioCompositionSnapshot().scenes.map((scene) => scene.code)).toEqual([OLD_CODE]);
		expect(JSON.stringify(readStudioProjectDocument())).toContain(OLD_CODE);
	});

	it("empties the live scene in the snapshot", () => {
		useSnippetStore.getState().setCode("");

		expect(readStudioCompositionSnapshot().scenes.map((scene) => scene.code)).toEqual([""]);
	});

	it("empties it in the saved document, which is what a server render reads", () => {
		useSnippetStore.getState().setCode("");

		expect(JSON.stringify(readStudioProjectDocument())).not.toContain(OLD_CODE);
	});

	it("empties it in the document the preview and the cloud copy build from the snippet's code", () => {
		useSnippetStore.getState().setCode("");
		// The composition bridge does this on every studio change.
		synchronizeStudioCompositionStore();

		const document = studioDocumentOf(
			useStudioCompositionStore.getState().value,
			useSnippetStore.getState().snippet.code,
		);
		expect(JSON.stringify(document)).not.toContain(OLD_CODE);
	});

	it("puts the code back as soon as something is typed", () => {
		useSnippetStore.getState().setCode("");

		useSnippetStore.getState().setCode("const next = 1;");

		expect(readStudioCompositionSnapshot().scenes.map((scene) => scene.code)).toEqual([
			"const next = 1;",
		]);
		expect(JSON.stringify(readStudioProjectDocument())).toContain("const next = 1;");
	});
});

describe("what clears an emptied editor", () => {
	beforeEach(() => {
		useSnippetStore.getState().importSnippet("const kept = 1;");
		useSnippetStore.getState().setCode("");
		expect(useSnippetStore.getState().draft).toBe("");
	});

	it("importDiff replaces the snippet and the draft with it", () => {
		useSnippetStore.getState().importDiff(DIFF);

		expect(useSnippetStore.getState().draft).toBeNull();
	});

	it("importChapters does too", () => {
		useSnippetStore.getState().importChapters([{ title: "one", diffText: DIFF }], {
			title: "chapters",
		});

		expect(useSnippetStore.getState().draft).toBeNull();
	});

	it("so does putting a history document back, which is what undo and redo do", () => {
		applyStudioProjectDocument(readStudioProjectDocument());

		expect(useSnippetStore.getState().draft).toBeNull();
	});
});
