import {
	addMediaAsset,
	addTextLayer,
	updateLayerPlacement,
} from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { EncodedProjectHistory } from "@/application/project/project-history";
import type { ProjectHistoryStorePort } from "@/application/project/project-history-store.port";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { Asset } from "@/domain/entities/asset";
import { Theme } from "@/domain/entities/theme";
import { useExportStore } from "@/presentation/stores/export.store";
import { createStudioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	loadStudioCompositionDocument,
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function memoryStorage(): ProjectHistoryStorePort & { readonly saved: Map<string, unknown> } {
	const saved = new Map<string, unknown>();
	return {
		saved,
		load: async (projectId) => structuredClone(saved.get(projectId) ?? null),
		save: async (history: EncodedProjectHistory) => {
			saved.set(history.projectId, structuredClone(history));
		},
	};
}

function openTemplate(projectId: string): void {
	const project = TEMPLATE_CATALOG[0]?.project;
	if (!project) {
		throw new Error("The template catalog must contain a project");
	}
	useSnippetStore.getState().importFromJson(JSON.stringify(project));
	loadStudioCompositionDocument(
		createStudioCompositionDocument({ ...readStudioCompositionSnapshot(), projectId }),
	);
}

function stepIds(): string[] {
	return useSnippetStore.getState().snippet.steps.map((step) => step.id);
}

function sceneId(index: number): string {
	const id = stepIds()[index];
	if (!id) {
		throw new Error(`The project must have a scene ${index}`);
	}
	return id;
}

let clock = 0;
let stopHistory: () => void = () => undefined;

beforeEach(() => {
	clock = 0;
	openTemplate("project-a");
});

afterEach(() => stopHistory());

function startHistory(storage: ProjectHistoryStorePort | null = null) {
	const history = createStudioHistory({ storage, now: () => clock });
	stopHistory = history.start();
	return history;
}

describe("the studio's project history", () => {
	it("undoes ten mixed edits in order and redoes them in order", () => {
		const history = startHistory();
		const states: ProjectDocumentV2[] = [readStudioProjectDocument()];
		const composition = () => useStudioCompositionStore.getState();
		const audio = Asset.create({
			id: "music",
			kind: "audio",
			fileName: "music.mp3",
			mimeType: "audio/mpeg",
			byteSize: 4,
			checksum: "c".repeat(64),
			durationMs: 2_000,
		});
		const edits: (() => void)[] = [
			() =>
				useSnippetStore.getState().setCode(`${useSnippetStore.getState().snippet.code}\n// typed`),
			() => useSnippetStore.getState().updateStepDuration(sceneId(1), 4_321),
			() => useSnippetStore.getState().reorderSteps([...stepIds()].reverse()),
			() => useExportStore.getState().setTransitionMs(1_000),
			() =>
				composition().transact((project) =>
					addTextLayer(project, sceneId(0), { id: "title", text: "Title" }),
				),
			() =>
				composition().transact((project) =>
					updateLayerPlacement(project, sceneId(0), "title", { x: 0.3, y: 0.4 }),
				),
			() => composition().transact((project) => addMediaAsset(project, sceneId(0), audio)),
			() => useSnippetStore.getState().removeStep(sceneId(2)),
			() => useSnippetStore.getState().setTitle("Renamed"),
			() => useSnippetStore.getState().setTheme(Theme.dracula()),
		];
		for (const edit of edits) {
			clock += 5_000;
			edit();
			history.capture();
			states.push(readStudioProjectDocument());
		}
		expect(new Set(states.map((state) => JSON.stringify(state))).size).toBe(11);

		for (let index = states.length - 2; index >= 0; index -= 1) {
			expect(history.undo()).toBe(true);
			expect(readStudioProjectDocument()).toEqual(states[index]);
		}
		expect(history.undo()).toBe(false);
		for (let index = 1; index < states.length; index += 1) {
			expect(history.redo()).toBe(true);
			expect(readStudioProjectDocument()).toEqual(states[index]);
		}
		expect(history.redo()).toBe(false);
	});

	it("shows the one scene an undo changed, and the composition follows the timeline", () => {
		const history = startHistory();
		const layered = sceneId(0);
		clock += 5_000;
		useStudioCompositionStore
			.getState()
			.transact((project) => addTextLayer(project, layered, { id: "title", text: "Title" }));
		history.capture();
		useSnippetStore.getState().setCurrentStepIndex(2);
		useStudioCompositionStore.getState().selectScene(sceneId(1));

		history.undo();

		expect(useSnippetStore.getState().currentStepIndex).toBe(0);
		expect(useStudioCompositionStore.getState().selectedSceneId).toBe(layered);
	});

	it("keeps the scene being edited when an undo changes the whole project", () => {
		const history = startHistory();
		const shown = sceneId(2);
		clock += 5_000;
		useSnippetStore.getState().setTheme(Theme.dracula());
		history.capture();
		useSnippetStore.getState().reorderSteps([...stepIds()].reverse());
		history.capture();
		useSnippetStore.getState().setCurrentStepIndex(0);

		history.undo();

		expect(stepIds()[useSnippetStore.getState().currentStepIndex]).toBe(shown);
		expect(useStudioCompositionStore.getState().selectedSceneId).toBe(shown);
		history.undo();
		expect(stepIds()[useSnippetStore.getState().currentStepIndex]).toBe(shown);
	});

	it("leaves the unsaved-work warning as it stood before the undone edit", () => {
		const history = startHistory();
		clock += 5_000;
		useSnippetStore.getState().setTitle("Edited");
		history.capture();
		clock += 5_000;
		useSnippetStore.getState().setTitle("Edited twice");
		history.capture();

		history.undo();
		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(true);
		history.undo();
		expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
	});

	it("is still there after a reload for the current project", async () => {
		const storage = memoryStorage();
		const first = startHistory(storage);
		const before = readStudioProjectDocument();
		clock += 5_000;
		useSnippetStore.getState().setTitle("Before the reload");
		first.capture();
		await first.flush();
		stopHistory();

		const second = startHistory(storage);
		await second.ready();

		expect(second.canUndo()).toBe(true);
		second.undo();
		expect(readStudioProjectDocument()).toEqual(before);
	});

	it("keeps each local project's history apart", async () => {
		const storage = memoryStorage();
		const history = startHistory(storage);
		clock += 5_000;
		useSnippetStore.getState().setTitle("Project A edit");
		history.capture();

		openTemplate("project-b");
		history.capture();
		await history.ready();

		expect(history.canUndo()).toBe(false);
		expect(storage.saved.has("project-a")).toBe(true);
	});
});
