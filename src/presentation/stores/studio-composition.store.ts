import { formatLineRanges } from "@/application/focus/line-ranges";
import {
	STUDIO_LIVE_SCENE_ID,
	type StudioCompositionSnapshot,
	createStudioCompositionDocument,
	synchronizeStudioComposition,
} from "@/application/project/studio-composition";
import type { Scene } from "@/domain/entities/scene";
import { useExportStore } from "@/presentation/stores/export.store";
import { createProjectStore } from "@/presentation/stores/project.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { create } from "zustand";

const STUDIO_PROJECT_ID = "studio-project";
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
		projectId: STUDIO_PROJECT_ID,
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
		scenes,
	};
}

export const useStudioCompositionStore = createProjectStore(
	createStudioCompositionDocument(readStudioCompositionSnapshot()),
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

export function studioSceneIdAt(index: number): string {
	const snapshot = readStudioCompositionSnapshot();
	return (
		snapshot.scenes[Math.min(Math.max(index, 0), snapshot.scenes.length - 1)]?.id ??
		STUDIO_LIVE_SCENE_ID
	);
}

export function hasAuthoredMultimedia(): boolean {
	const project = useStudioCompositionStore.getState().value.project;
	return (
		project.assets.length > 0 ||
		project.audioCues.length > 0 ||
		project.scenes.some((scene) => scene.blocks.some((block) => block.kind !== "code"))
	);
}
