import { addTextLayer } from "@/application/project/multimedia-authoring";
import {
	STUDIO_LIVE_SCENE_ID,
	createStudioCompositionDocument,
} from "@/application/project/studio-composition";
import {
	applyStudioProjectDocument,
	createStudioHistory,
} from "@/presentation/stores/project-history.store";
import { studioPlaybackTimeline, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	loadStudioCompositionDocument,
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * #168 follow-up. The document keeps the last code while the editor is emptied
 * (the snippet keeps it, D2): rewriting the live scene to "" would make the
 * composition invent a starter title card there. What an emptied editor with no
 * scene changes is what can be played and rendered, which has its own tests.
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

let projectCount = 0;
let layerCount = 0;
let clock = 0;
let stopHistory: () => void = () => undefined;

function openPlain() {
	useSnippetStore.getState().importFromJson(
		JSON.stringify({
			title: "plain",
			code: OLD_CODE,
			language: "typescript",
			themeName: "midnight",
			background: "mesh:solar",
			steps: [],
		}),
	);
	// A fresh composition for each test: the store outlives them.
	loadStudioCompositionDocument(
		createStudioCompositionDocument({
			...readStudioCompositionSnapshot(),
			projectId: `draft-document-${projectCount++}`,
		}),
	);
}

function openMediaOnly() {
	openPlain();
	useStudioCompositionStore
		.getState()
		.transact((project) =>
			addTextLayer(project, STUDIO_LIVE_SCENE_ID, { id: `title-${layerCount++}`, text: "Hello" }),
		);
}

beforeEach(() => {
	clock = 0;
});

afterEach(() => stopHistory());

describe("emptying the editor of a project with no scene, then typing again", () => {
	beforeEach(openPlain);

	it("adds no layer, no media and no history entry, and leaves the document as it was", () => {
		const history = createStudioHistory({ storage: null, now: () => clock });
		stopHistory = history.start();
		const before = readStudioProjectDocument();

		clock += 5_000;
		useSnippetStore.getState().setCode("");
		history.capture();
		expect(readStudioProjectDocument()).toEqual(before);
		expect(hasAuthoredMultimedia()).toBe(false);

		clock += 5_000;
		useSnippetStore.getState().setCode(OLD_CODE);
		history.capture();

		const after = readStudioProjectDocument();
		expect(after).toEqual(before);
		expect(hasAuthoredMultimedia()).toBe(false);
		expect(JSON.stringify(after)).not.toContain('"kind":"text"');
		expect(JSON.stringify(after)).not.toContain("Add your text");
		expect(history.canUndo()).toBe(false);
	});

	it("keeps the last code on the live scene while the editor is empty", () => {
		useSnippetStore.getState().setCode("");

		expect(readStudioCompositionSnapshot().scenes.map((scene) => scene.code)).toEqual([OLD_CODE]);
		expect(JSON.stringify(readStudioProjectDocument())).toContain(OLD_CODE);
	});
});

describe("emptying the editor of a project with media and no scene", () => {
	beforeEach(openMediaOnly);

	it("keeps the last code in the snapshot and the document, and adds nothing", () => {
		const before = readStudioProjectDocument();

		useSnippetStore.getState().setCode("");

		expect(hasAuthoredMultimedia()).toBe(true);
		expect(readStudioCompositionSnapshot().scenes.map((scene) => scene.code)).toEqual([OLD_CODE]);
		expect(readStudioProjectDocument()).toEqual(before);
	});

	it("cannot be played while the editor is empty, and can once code is back", () => {
		expect(studioPlaybackTimeline()).not.toBeNull();

		useSnippetStore.getState().setCode("");
		expect(studioPlaybackTimeline()).toBeNull();

		useSnippetStore.getState().setCode(OLD_CODE);
		expect(studioPlaybackTimeline()).not.toBeNull();
	});

	it("play() does nothing while the editor is empty", async () => {
		useSnippetStore.getState().setCode("");

		await useSnippetStore.getState().play();

		expect(useSnippetStore.getState().isPlaying).toBe(false);
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
