import { STUDIO_LIVE_SCENE_ID } from "@/application/project/studio-composition";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	isStudioPersistenceHeld,
	onStudioPersistenceRelease,
	readStudioProjectDocument,
	synchronizeStudioCompositionStore,
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { studioLocalLibrary } from "@/presentation/studio-media-runtime";
import { readLocalProjects } from "@/presentation/utils/local-project-storage";
import {
	LEGACY_STUDIO_PROJECT_ID,
	restoreStudioProject,
} from "@/presentation/utils/studio-project-replacement";
import { useEffect } from "react";

const PERSIST_DELAY_MS = 240;

/** The local project the studio opened on; the draft boot made sure there is one. */
function bootProjectId(): string {
	return readLocalProjects().activeId ?? LEGACY_STUDIO_PROJECT_ID;
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
			// Held while another project's layers are being put back on its code:
			// the composition mixes two projects until that lands.
			if (!restored || isStudioPersistenceHeld() || typeof indexedDB === "undefined") {
				return;
			}
			const document = readStudioProjectDocument();
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
		const unsubscribeRelease = onStudioPersistenceRelease(persist);
		if (typeof indexedDB !== "undefined") {
			void restoreStudioProject(bootProjectId(), () => active, { adoptLegacy: true })
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
			unsubscribeRelease();
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
