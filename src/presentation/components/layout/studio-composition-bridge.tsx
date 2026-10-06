import { referencedAssetIds } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { STUDIO_LIVE_SCENE_ID } from "@/application/project/studio-composition";
import { useStudioBoot } from "@/presentation/components/layout/studio-boot-guard";
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
import { setStudioCompositionRestored } from "@/presentation/utils/studio-composition-ready";
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
	// Held while the boot guard tries the default project: the composition still
	// follows the code, but nothing is restored from or written to the device.
	const { held, guardRestore } = useStudioBoot();
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
		let pending: { readonly document: ProjectDocumentV2; readonly signature: string } | null = null;
		let lastPersisted = "";
		const write = () => {
			if (persistenceTimer) {
				clearTimeout(persistenceTimer);
				persistenceTimer = null;
			}
			if (!pending) {
				return;
			}
			const { document, signature } = pending;
			pending = null;
			lastPersisted = signature;
			void studioLocalLibrary.saveProject(document).catch(() => undefined);
		};
		const persist = () => {
			// Held while another project's layers are being put back on its code:
			// the composition mixes two projects until that lands.
			if (!restored || isStudioPersistenceHeld() || typeof indexedDB === "undefined") {
				return;
			}
			const document = readStudioProjectDocument();
			const signature = JSON.stringify(document);
			if (signature === lastPersisted) {
				// Back on what is already stored (an undo then a redo inside the
				// window): a save still waiting for the state just left must not fire.
				pending = null;
				if (persistenceTimer) {
					clearTimeout(persistenceTimer);
					persistenceTimer = null;
				}
				return;
			}
			pending = { document, signature };
			if (persistenceTimer) {
				clearTimeout(persistenceTimer);
			}
			persistenceTimer = setTimeout(write, PERSIST_DELAY_MS);
		};
		// The debounce must not cost the last edit: a tab closed or sent to the
		// background inside it writes at once. Hidden comes first and leaves time
		// for IndexedDB; pagehide covers a close that skips it.
		const flushWhenHidden = () => {
			if (document.visibilityState === "hidden") {
				write();
			}
		};
		document.addEventListener("visibilitychange", flushWhenHidden);
		window.addEventListener("pagehide", write);
		const unsubscribeComposition = useStudioCompositionStore.subscribe(persist);
		const unsubscribeRelease = onStudioPersistenceRelease(persist);
		setStudioCompositionRestored(false);
		if (typeof indexedDB !== "undefined" && !held) {
			// The stored layers arrive after the code has committed, so the boot guard
			// watches their landing too: a stored composition that throws the studio
			// is set aside with its project instead of replayed on every reload.
			void restoreStudioProject(bootProjectId(), () => active, {
				adoptLegacy: true,
				guard: (restore) => guardRestore(restore, "composition"),
			})
				.catch(() => undefined)
				.then(() => {
					if (!active) {
						return;
					}
					restored = true;
					setStudioCompositionRestored(true);
					persist();
					// Reload is the checkpoint where no undo can bring a deleted layer
					// back: bytes no project references any more leave the device. The
					// open project's live ids are kept even before its save lands.
					void studioLocalLibrary
						.deleteUnreferencedAssets(referencedAssetIds(readStudioProjectDocument()))
						.catch(() => undefined);
				});
		} else {
			setStudioCompositionRestored(true);
		}
		return () => {
			active = false;
			document.removeEventListener("visibilitychange", flushWhenHidden);
			window.removeEventListener("pagehide", write);
			if (persistenceTimer) {
				clearTimeout(persistenceTimer);
			}
			unsubscribeSnippet();
			unsubscribeExport();
			unsubscribeComposition();
			unsubscribeRelease();
		};
	}, [held, guardRestore]);

	useEffect(() => {
		const composition = useStudioCompositionStore.getState();
		if (composition.value.project.scenes.some((scene) => scene.id === currentSceneId)) {
			composition.selectScene(currentSceneId);
		}
		useStudioCompositionSelectionStore.getState().selectAudioCue(null);
	}, [currentSceneId]);

	return null;
}
