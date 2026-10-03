import {
	STUDIO_LIVE_SCENE_ID,
	adoptStoredSceneIds,
} from "@/application/project/studio-composition";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	resynchronizeStudioCompositionStore,
	studioSceneIdAt,
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

async function restoreStoredComposition(isActive: () => boolean): Promise<void> {
	const stored = await studioLocalLibrary.loadCurrent();
	const current = useStudioCompositionStore.getState();
	if (!isActive() || !stored || stored.project.id !== current.value.project.id) {
		return;
	}
	for (const asset of stored.project.assets) {
		let content: Awaited<ReturnType<typeof studioLocalLibrary.loadAsset>> = null;
		try {
			content = await studioLocalLibrary.loadAsset({
				projectId: stored.project.id,
				assetId: asset.id,
			});
		} catch {
			// One unreadable blob must not abort the whole restore: the layer then
			// shows its missing-media state instead of the project vanishing.
			content = null;
		}
		if (!isActive()) {
			return;
		}
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
	// The draft restore minted fresh step ids, so the stored scenes are re-keyed
	// before loading, and the reconcile is forced: the Studio snapshot did not
	// change, which would otherwise skip it and leave the two stores disagreeing.
	current.loadDocument(adoptStoredSceneIds(stored, readStudioCompositionSnapshot()));
	resynchronizeStudioCompositionStore();
	// loadDocument resets selection to the first scene; follow the Studio's.
	const sceneId = studioSceneIdAt(useSnippetStore.getState().currentStepIndex);
	const composition = useStudioCompositionStore.getState();
	if (composition.value.project.scenes.some((scene) => scene.id === sceneId)) {
		composition.selectScene(sceneId);
	}
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
		let active = true;
		// The blank boot document must never be written before the stored project
		// has been read: a debounced save that lands between the restore's reads
		// would replace the saved project, media references included.
		let restored = false;
		synchronizeStudioCompositionStore();
		const unsubscribeSnippet = useSnippetStore.subscribe(synchronizeStudioCompositionStore);
		const unsubscribeExport = useExportStore.subscribe(synchronizeStudioCompositionStore);
		let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
		let lastPersisted = "";
		const persist = () => {
			if (!restored || typeof indexedDB === "undefined") {
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
			void restoreStoredComposition(() => active)
				.catch(() => undefined)
				.then(() => {
					if (!active) {
						return;
					}
					restored = true;
					persist();
				});
		}
		return () => {
			active = false;
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
