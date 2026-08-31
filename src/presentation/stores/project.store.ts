import {
	type HydratedProjectDocument,
	hydrateProjectDocument,
} from "@/application/project/hydrate-project-document";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import type { Project } from "@/domain/entities/project";
import { create } from "zustand";

interface EditorSnapshot {
	readonly value: HydratedProjectDocument;
	readonly selectedSceneId: string | null;
	readonly selectedBlockId: string | null;
}

export interface ProjectStoreState extends EditorSnapshot {
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	selectScene(sceneId: string | null): void;
	selectBlock(sceneId: string, blockId: string | null): void;
	loadDocument(document: ProjectDocumentV2): void;
	transact(edit: (project: Project) => Project): void;
	/**
	 * Reconcile state owned by the surrounding Studio (code scenes, order and
	 * timing) without turning every keystroke into a multimedia undo entry.
	 * Existing history is reconciled too, so undoing a layer edit never resurrects
	 * stale code or a deleted Studio scene.
	 */
	synchronize(edit: (project: Project) => Project): void;
	undo(): void;
	redo(): void;
	toDocument(): ProjectDocumentV2;
}

interface InternalProjectStoreState extends ProjectStoreState {
	readonly past: readonly EditorSnapshot[];
	readonly future: readonly EditorSnapshot[];
}

const MAX_HISTORY = 100;

function snapshot(state: EditorSnapshot): EditorSnapshot {
	return {
		value: state.value,
		selectedSceneId: state.selectedSceneId,
		selectedBlockId: state.selectedBlockId,
	};
}

function normalizeSelection(
	project: Project,
	selection: Pick<EditorSnapshot, "selectedSceneId" | "selectedBlockId">,
): Pick<EditorSnapshot, "selectedSceneId" | "selectedBlockId"> {
	const requestedScene = selection.selectedSceneId
		? project.scenes.find((scene) => scene.id === selection.selectedSceneId)
		: undefined;
	const scene = requestedScene ?? project.scenes[0];
	if (!scene) {
		return { selectedSceneId: null, selectedBlockId: null };
	}
	const selectedBlockId = scene.blocks.some((block) => block.id === selection.selectedBlockId)
		? selection.selectedBlockId
		: null;
	return { selectedSceneId: scene.id, selectedBlockId };
}

/**
 * Generic multimedia editor state. History belongs to the document itself, so
 * undo never waits for a toast and works identically for text, code and media.
 */
export function createProjectStore(initialDocument: ProjectDocumentV2) {
	const initialValue = hydrateProjectDocument(initialDocument);
	const initialSelection = normalizeSelection(initialValue.project, {
		selectedSceneId: initialValue.project.scenes[0]?.id ?? null,
		selectedBlockId: null,
	});

	return create<InternalProjectStoreState>((set, get) => ({
		value: initialValue,
		...initialSelection,
		past: [],
		future: [],
		canUndo: false,
		canRedo: false,
		selectScene: (sceneId) => {
			if (sceneId === null) {
				set({ selectedSceneId: null, selectedBlockId: null });
				return;
			}
			if (!get().value.project.scenes.some((scene) => scene.id === sceneId)) {
				throw new Error(`Scene ${sceneId} does not belong to project`);
			}
			set({ selectedSceneId: sceneId, selectedBlockId: null });
		},
		selectBlock: (sceneId, blockId) => {
			const scene = get().value.project.scenes.find((candidate) => candidate.id === sceneId);
			if (!scene) {
				throw new Error(`Scene ${sceneId} does not belong to project`);
			}
			if (blockId !== null && !scene.blocks.some((block) => block.id === blockId)) {
				throw new Error(`Block ${blockId} does not belong to scene ${sceneId}`);
			}
			set({ selectedSceneId: sceneId, selectedBlockId: blockId });
		},
		loadDocument: (document) => {
			const value = hydrateProjectDocument(document);
			const selection = normalizeSelection(value.project, {
				selectedSceneId: value.project.scenes[0]?.id ?? null,
				selectedBlockId: null,
			});
			set({
				value,
				...selection,
				past: [],
				future: [],
				canUndo: false,
				canRedo: false,
			});
		},
		transact: (edit) => {
			const current = get();
			const project = edit(current.value.project);
			if (project === current.value.project) {
				return;
			}
			const selection = normalizeSelection(project, current);
			const past = [...current.past, snapshot(current)].slice(-MAX_HISTORY);
			set({
				value: Object.freeze({ ...current.value, project }),
				...selection,
				past,
				future: [],
				canUndo: past.length > 0,
				canRedo: false,
			});
		},
		synchronize: (edit) => {
			const current = get();
			const reconcile = (entry: EditorSnapshot): EditorSnapshot => {
				const project = edit(entry.value.project);
				const selection = normalizeSelection(project, entry);
				return {
					value:
						project === entry.value.project
							? entry.value
							: Object.freeze({ ...entry.value, project }),
					...selection,
				};
			};
			const next = reconcile(current);
			set({
				...next,
				past: current.past.map(reconcile),
				future: current.future.map(reconcile),
			});
		},
		undo: () => {
			const current = get();
			const previous = current.past.at(-1);
			if (!previous) {
				return;
			}
			const past = current.past.slice(0, -1);
			const future = [...current.future, snapshot(current)];
			set({
				...previous,
				past,
				future,
				canUndo: past.length > 0,
				canRedo: true,
			});
		},
		redo: () => {
			const current = get();
			const next = current.future.at(-1);
			if (!next) {
				return;
			}
			const past = [...current.past, snapshot(current)].slice(-MAX_HISTORY);
			const future = current.future.slice(0, -1);
			set({
				...next,
				past,
				future,
				canUndo: true,
				canRedo: future.length > 0,
			});
		},
		toDocument: () => serializeProjectDocument(get().value),
	}));
}

/** Default V2 editor hook. Tests and embedders can still create isolated stores. */
export const useProjectStore = createProjectStore(createStarterMultimediaProject());
