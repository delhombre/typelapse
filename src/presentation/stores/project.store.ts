import {
	type HydratedProjectDocument,
	hydrateProjectDocument,
} from "@/application/project/hydrate-project-document";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import type { Project } from "@/domain/entities/project";
import { create } from "zustand";

interface EditorSnapshot {
	readonly value: HydratedProjectDocument;
	readonly selectedSceneId: string | null;
	readonly selectedBlockId: string | null;
}

export interface ProjectStoreState extends EditorSnapshot {
	selectScene(sceneId: string | null): void;
	selectBlock(sceneId: string, blockId: string | null): void;
	loadDocument(document: ProjectDocumentV2): void;
	transact(edit: (project: Project) => Project): void;
	/** Reconcile state owned by the surrounding Studio (code scenes, order and timing). */
	synchronize(edit: (project: Project) => Project): void;
	toDocument(): ProjectDocumentV2;
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
 * Generic multimedia editor state. It keeps no past: the Studio's project
 * history versions the whole document, layers included.
 */
export function createProjectStore(initialDocument: ProjectDocumentV2) {
	const initialValue = hydrateProjectDocument(initialDocument);
	const initialSelection = normalizeSelection(initialValue.project, {
		selectedSceneId: initialValue.project.scenes[0]?.id ?? null,
		selectedBlockId: null,
	});

	return create<ProjectStoreState>((set, get) => ({
		value: initialValue,
		...initialSelection,
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
			set({ value, ...selection });
		},
		transact: (edit) => {
			const current = get();
			const project = edit(current.value.project);
			if (project === current.value.project) {
				return;
			}
			const selection = normalizeSelection(project, current);
			set({ value: Object.freeze({ ...current.value, project }), ...selection });
		},
		synchronize: (edit) => {
			const current = get();
			const project = edit(current.value.project);
			const selection = normalizeSelection(project, current);
			set({
				value:
					project === current.value.project
						? current.value
						: Object.freeze({ ...current.value, project }),
				...selection,
			});
		},
		toDocument: () => serializeProjectDocument(get().value),
	}));
}
