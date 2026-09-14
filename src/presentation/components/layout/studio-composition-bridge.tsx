import { STUDIO_LIVE_SCENE_ID } from "@/application/project/studio-composition";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	synchronizeStudioCompositionStore,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import {
	studioLocalLibrary,
	studioMediaRegistry,
	studioMediaSourceFactory,
} from "@/presentation/studio-media-runtime";
import { useEffect } from "react";

const PERSIST_DELAY_MS = 240;

async function restoreStoredComposition(): Promise<void> {
	const stored = await studioLocalLibrary.loadCurrent();
	const current = useStudioCompositionStore.getState();
	if (!stored || stored.project.id !== current.value.project.id) {
		return;
	}
	for (const asset of stored.project.assets) {
		const content = await studioLocalLibrary.loadAsset({
			projectId: stored.project.id,
			assetId: asset.id,
		});
		if (!content || !(content.opaqueHandle instanceof Blob)) {
			continue;
		}
		studioMediaRegistry.register(
			studioMediaSourceFactory.create(
				asset.id,
				{
					name: asset.fileName,
					mimeType: asset.mimeType,
					byteSize: asset.byteSize,
					opaqueHandle: content.opaqueHandle,
				},
				{},
			),
		);
	}
	current.loadDocument(stored);
	synchronizeStudioCompositionStore();
}

/**
 * The accepted Studio remains authoritative for scene creation, selection,
 * order, code and timing. This invisible bridge mirrors that spine into the
 * multimedia aggregate; layer edits never push a competing UI state back.
 */
export function StudioCompositionBridge() {
	const currentStepIndex = useSnippetStore((state) => state.currentStepIndex);
	const steps = useSnippetStore((state) => state.snippet.steps);
	const currentSceneId = steps[currentStepIndex]?.id ?? STUDIO_LIVE_SCENE_ID;

	useEffect(() => {
		synchronizeStudioCompositionStore();
		const unsubscribeSnippet = useSnippetStore.subscribe(synchronizeStudioCompositionStore);
		const unsubscribeExport = useExportStore.subscribe(synchronizeStudioCompositionStore);
		let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
		let lastPersisted = "";
		const persist = () => {
			if (typeof indexedDB === "undefined") {
				return;
			}
			const document = useStudioCompositionStore.getState().toDocument();
			const signature = JSON.stringify(document);
			if (signature === lastPersisted) {
				return;
			}
			if (persistenceTimer) {
				clearTimeout(persistenceTimer);
			}
			persistenceTimer = setTimeout(() => {
				lastPersisted = signature;
				void studioLocalLibrary.saveProject(document).catch(() => undefined);
			}, PERSIST_DELAY_MS);
		};
		const unsubscribeComposition = useStudioCompositionStore.subscribe(persist);
		if (typeof indexedDB !== "undefined") {
			void restoreStoredComposition()
				.then(persist)
				.catch(() => undefined);
		}
		return () => {
			if (persistenceTimer) {
				clearTimeout(persistenceTimer);
			}
			unsubscribeSnippet();
			unsubscribeExport();
			unsubscribeComposition();
		};
	}, []);

	useEffect(() => {
		const composition = useStudioCompositionStore.getState();
		if (composition.value.project.scenes.some((scene) => scene.id === currentSceneId)) {
			composition.selectScene(currentSceneId);
		}
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	}, [currentSceneId]);

	return null;
}
