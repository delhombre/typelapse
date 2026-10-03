import { formatLineRanges } from "@/application/focus/line-ranges";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { isProjectFps } from "@/application/project/project-payload";
import {
	STUDIO_LIVE_SCENE_ID,
	type StudioCompositionSnapshot,
	createStudioCompositionDocument,
	synchronizeStudioComposition,
} from "@/application/project/studio-composition";
import { studioProjectDocument } from "@/application/project/studio-document";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import type { Project } from "@/domain/entities/project";
import type { Scene } from "@/domain/entities/scene";
import { EXPORT_DEFAULTS, useExportStore } from "@/presentation/stores/export.store";
import { createProjectStore } from "@/presentation/stores/project.store";
import { registerPlaybackComposition, useSnippetStore } from "@/presentation/stores/snippet.store";
import { create } from "zustand";

/**
 * The id of the composition the module boots with, before the local library
 * slot has been read. The bridge's restore replaces it with the slot's own id,
 * which is what keys the stored composition; this placeholder is never saved.
 */
export const BOOT_PROJECT_ID = "studio-project";
const STATIC_SCENE_DURATION_MS = 3_000;

export function readStudioCompositionSnapshot(): StudioCompositionSnapshot {
	const state = useSnippetStore.getState();
	const exportState = useExportStore.getState();
	const { snippet } = state;
	const scenes =
		snippet.steps.length > 0
			? snippet.steps.map((step) => {
					const focus = formatLineRanges(step.highlightRanges);
					return {
						id: step.id,
						code: step.code,
						durationMs: step.duration,
						...(step.annotation ? { caption: step.annotation } : {}),
						...(focus ? { focus } : {}),
					};
				})
			: [
					{
						id: STUDIO_LIVE_SCENE_ID,
						code: snippet.code,
						durationMs: STATIC_SCENE_DURATION_MS,
					},
				];

	return {
		projectId: BOOT_PROJECT_ID,
		title: snippet.title,
		language: snippet.language,
		themeName: snippet.theme.name,
		fontFamily: snippet.theme.fontFamily,
		borderRadius: snippet.theme.borderRadius,
		background: state.background,
		windowChrome: state.windowChrome,
		showLineNumbers: state.showLineNumbers,
		lineNumberStart: state.lineNumberStart,
		framePadding: state.framePadding,
		cardMargin: state.cardMargin,
		canvas: { width: exportState.width, height: exportState.height },
		transitionMs: exportState.transitionMs,
		transitionEasing: exportState.transitionEasing,
		typewriter: exportState.typewriter,
		focusZoom: exportState.focusZoom,
		progressStyle: exportState.progressStyle,
		watermark: state.watermark,
		// Written only when chosen: absent reads as the default on open.
		...(isProjectFps(exportState.fps) && exportState.fps !== EXPORT_DEFAULTS.fps
			? { fps: exportState.fps }
			: {}),
		scenes,
	};
}

// The Studio's project history versions the whole document, layers included.
export const useStudioCompositionStore = createProjectStore(
	createStudioCompositionDocument(readStudioCompositionSnapshot()),
	{ history: false },
);

interface StudioCompositionSelectionState {
	readonly selectedAudioCueId: string | null;
	selectAudioCue(cueId: string | null): void;
}

export const useStudioCompositionSelectionStore = create<StudioCompositionSelectionState>(
	(set) => ({
		selectedAudioCueId: null,
		selectAudioCue: (selectedAudioCueId) => set({ selectedAudioCueId }),
	}),
);

const sceneArchive = new Map<string, Scene>();
let lastSnapshotSignature = "";

function snapshotSignature(snapshot: StudioCompositionSnapshot): string {
	return JSON.stringify(snapshot);
}

function archiveRemovedScenes(desiredIds: ReadonlySet<string>): void {
	for (const scene of useStudioCompositionStore.getState().value.project.scenes) {
		if (!desiredIds.has(scene.id)) {
			sceneArchive.set(scene.id, scene);
		}
	}
}

/** Reconcile once; cheap signature guards make playback rAF updates no-ops. */
export function synchronizeStudioCompositionStore(): void {
	reconcileStudioComposition(false);
}

/**
 * Reconcile even though the Studio snapshot is unchanged. For callers that
 * replaced the composition itself (a restore): the loaded document still has
 * to be reconciled against the Studio, which the signature guard would skip.
 * A separate entry point because the plain one is handed to store `subscribe`,
 * which calls it with store state as arguments.
 */
export function resynchronizeStudioCompositionStore(): void {
	reconcileStudioComposition(true);
}

function reconcileStudioComposition(force: boolean): void {
	const snapshot = readStudioCompositionSnapshot();
	const signature = snapshotSignature(snapshot);
	if (!force && signature === lastSnapshotSignature) {
		return;
	}
	lastSnapshotSignature = signature;
	const desiredIds = new Set(snapshot.scenes.map((scene) => scene.id));
	archiveRemovedScenes(desiredIds);
	useStudioCompositionStore
		.getState()
		.synchronize((project) => synchronizeStudioComposition(project, snapshot, sceneArchive));
}

/**
 * Replace the composition with a whole document (a project file, a library
 * project) and reconcile it against the Studio. Scenes archived from the
 * previous document are forgotten: a file that reuses its ids must not get a
 * closed project's deleted scenes back.
 */
export function loadStudioCompositionDocument(document: ProjectDocumentV2): void {
	sceneArchive.clear();
	useStudioCompositionStore.getState().loadDocument(document);
	resynchronizeStudioCompositionStore();
}

/** The project document as it stands: what the file export and autosave write. */
export function readStudioProjectDocument(): ProjectDocumentV2 {
	// Whoever saves must not depend on a subscriber having already mirrored the
	// last Studio edit; the signature guard makes this free when it has.
	synchronizeStudioCompositionStore();
	return studioProjectDocument(
		useStudioCompositionStore.getState().toDocument(),
		readStudioCompositionSnapshot(),
		useSnippetStore.getState().snippet.code,
	);
}

let persistenceHolds = 0;
const persistenceReleaseListeners = new Set<() => void>();

/**
 * Suspend autosave while the composition is swapped for another project's.
 * Between loading the next project's code and its stored layers, the
 * composition briefly mixes the two; saving it then would write that mix over
 * a project. Returns the release, which is idempotent.
 */
export function holdStudioPersistence(): () => void {
	persistenceHolds += 1;
	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		persistenceHolds -= 1;
		if (persistenceHolds === 0) {
			for (const listener of [...persistenceReleaseListeners]) {
				listener();
			}
		}
	};
}

export function isStudioPersistenceHeld(): boolean {
	return persistenceHolds > 0;
}

export function onStudioPersistenceRelease(listener: () => void): () => void {
	persistenceReleaseListeners.add(listener);
	return () => persistenceReleaseListeners.delete(listener);
}

/**
 * Point the composition at the scene the timeline has selected, keeping the
 * selected layer when that scene still holds it. A document load resets the
 * selection to the first scene; the timeline is the authority on which scene is
 * being edited.
 */
export function followTimelineSelection(blockId: string | null = null): void {
	const sceneId = studioSceneIdAt(useSnippetStore.getState().currentStepIndex);
	const composition = useStudioCompositionStore.getState();
	const scene = composition.value.project.scenes.find((candidate) => candidate.id === sceneId);
	if (!scene) {
		return;
	}
	composition.selectBlock(
		sceneId,
		blockId && scene.blocks.some((block) => block.id === blockId) ? blockId : null,
	);
}

export function studioSceneIdAt(index: number): string {
	const snapshot = readStudioCompositionSnapshot();
	return (
		snapshot.scenes[Math.min(Math.max(index, 0), snapshot.scenes.length - 1)]?.id ??
		STUDIO_LIVE_SCENE_ID
	);
}

export function hasAuthoredMultimedia(
	project: Pick<Project, "assets" | "audioCues" | "scenes"> = useStudioCompositionStore.getState()
		.value.project,
): boolean {
	return (
		project.assets.length > 0 ||
		project.audioCues.length > 0 ||
		project.scenes.some((scene) => scene.blocks.some((block) => block.kind !== "code"))
	);
}

// The playback clock runs to the composition's duration (the audio tail) and
// knows which export route the project takes. A pure read: the composition
// bridge already reconciles on every Studio change, and the timeline calls
// this while rendering.
registerPlaybackComposition(() => {
	const document = useStudioCompositionStore.getState().toDocument();
	return {
		durationMs: compileSceneTimeline({
			document,
			fps: useExportStore.getState().fps,
			loop: useExportStore.getState().loop,
		}).durationMs,
		hasAuthoredMedia: hasAuthoredMultimedia(),
	};
});
