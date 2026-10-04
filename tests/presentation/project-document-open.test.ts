import { addTextLayer } from "@/application/project/multimedia-authoring";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import {
	hasStudioWorkToLose,
	openStudioProjectDocument,
} from "@/presentation/utils/studio-project-replacement";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Opening a project file replaces the whole Studio: the code snippet AND the
 * composition of text, media and audio layers above it. It used to replace only
 * the snippet, so the previous project's text layer was cloned into every scene
 * of the opened file, and nothing asked first because only code edits counted
 * as work to lose.
 */

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

const THREE_STEPS = JSON.stringify({
	title: "Three steps",
	code: "const c = 3;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [
		{ code: "const a = 1;", duration: 1200 },
		{ code: "const b = 2;", duration: 1200 },
		{ code: "const c = 3;", duration: 1200 },
	],
});

const SINGLE_FRAME = JSON.stringify({
	title: "Single frame",
	code: "const only = 1;",
	language: "typescript",
	themeName: "midnight",
});

function textLayerCount(): number {
	return useStudioCompositionStore
		.getState()
		.toDocument()
		.project.scenes.flatMap((scene) => scene.blocks)
		.filter((block) => block.kind === "text").length;
}

function authorTextLayer(): void {
	synchronizeStudioCompositionStore();
	const composition = useStudioCompositionStore.getState();
	const sceneId = composition.value.project.scenes[0]?.id;
	if (!sceneId) {
		throw new Error("expected a scene");
	}
	composition.transact((project) => addTextLayer(project, sceneId, { text: "Old project" }));
	expect(textLayerCount()).toBe(1);
}

beforeEach(() => {
	openStudioProjectDocument(SINGLE_FRAME);
});

describe("opening a project document", () => {
	it("counts an authored layer as work to lose even when the code is untouched", () => {
		expect(hasStudioWorkToLose()).toBe(false);
		authorTextLayer();
		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
		expect(hasAuthoredMultimedia()).toBe(true);
		expect(hasStudioWorkToLose()).toBe(true);
	});

	it("does not leak the previous project's layers into every scene of the opened one", () => {
		authorTextLayer();

		openStudioProjectDocument(THREE_STEPS);

		const scenes = useStudioCompositionStore.getState().toDocument().project.scenes;
		expect(scenes).toHaveLength(3);
		expect(textLayerCount()).toBe(0);
		expect(hasAuthoredMultimedia()).toBe(false);
	});

	it("leaves both stores untouched when the file is refused", () => {
		authorTextLayer();
		const snippetBefore = JSON.stringify(useSnippetStore.getState().toProjectPayload());
		const compositionBefore = JSON.stringify(useStudioCompositionStore.getState().toDocument());

		expect(() => openStudioProjectDocument('{"schemaVersion":2,"project":{"id":"x"}}')).toThrow();

		expect(JSON.stringify(useSnippetStore.getState().toProjectPayload())).toBe(snippetBefore);
		expect(JSON.stringify(useStudioCompositionStore.getState().toDocument())).toBe(
			compositionBefore,
		);
	});

	it("loads values the lenient reader used to pass to a stricter composition", () => {
		const hostile = JSON.parse(THREE_STEPS);
		hostile.steps[0].duration = 1500.5;
		hostile.steps[1].duration = 1e15;
		hostile.framePadding = -5000;

		expect(() => openStudioProjectDocument(JSON.stringify(hostile))).not.toThrow();

		const durations = useSnippetStore.getState().snippet.steps.map((step) => step.duration);
		expect(durations).toEqual([1501, 10_000, 1200]);
		const scenes = useStudioCompositionStore.getState().toDocument().project.scenes;
		expect(scenes.map((scene) => scene.durationMs)).toEqual(durations);
	});
});
