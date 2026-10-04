import type { ProjectDocumentV2 } from "@/application/project/project-document";
import {
	type ProjectHistory,
	canRedoProjectEdit,
	canUndoProjectEdit,
	createProjectHistory,
	decodeProjectHistory,
	encodeProjectHistory,
	presentProjectDocument,
	recordProjectEdit,
	redoProjectEdit,
	settleProjectHistory,
	undoProjectEdit,
} from "@/application/project/project-history";
import type { ProjectHistoryStorePort } from "@/application/project/project-history-store.port";
import { adoptStoredSceneIds } from "@/application/project/studio-composition";
import { IndexedDbProjectHistoryAdapter } from "@/infrastructure/project/indexeddb-project-history.adapter";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	BOOT_PROJECT_ID,
	followTimelineSelection,
	holdStudioPersistence,
	isStudioPersistenceHeld,
	loadStudioCompositionDocument,
	onStudioPersistenceRelease,
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { registerStoredMedia } from "@/presentation/utils/studio-project-replacement";
import { create } from "zustand";

const PERSIST_DELAY_MS = 400;

/** The snippet fields that are project content; playback and selection are not. */
const SNIPPET_CONTENT = [
	"snippet",
	"background",
	"windowChrome",
	"showLineNumbers",
	"lineNumberStart",
	"framePadding",
	"cardMargin",
	"watermark",
] as const;

/** The export settings a project document carries. */
const EXPORT_CONTENT = [
	"width",
	"height",
	"transitionMs",
	"transitionEasing",
	"typewriter",
	"focusZoom",
	"progressStyle",
	"fps",
] as const;

function changed<T extends object>(state: T, previous: T, keys: readonly (keyof T)[]): boolean {
	return keys.some((key) => state[key] !== previous[key]);
}

type SceneOf = ProjectDocumentV2["project"]["scenes"][number];

/**
 * The scene the timeline should show once `next` replaces `previous`: the one
 * scene the step changed or brought back, so an undo is seen where it happened;
 * otherwise the scene that was on screen, by identity, wherever it now sits.
 */
function sceneToShow(
	previous: readonly SceneOf[],
	next: readonly SceneOf[],
	shownId: string | undefined,
): number {
	// The outgoing transition follows a scene's position, not its content: the
	// scene before a restored one gains one without having been edited.
	const content = ({ transitionOut: _position, ...scene }: SceneOf) => JSON.stringify(scene);
	const before = new Map(previous.map((scene) => [scene.id, content(scene)]));
	const touched = next.flatMap((scene, index) =>
		before.get(scene.id) === content(scene) ? [] : [index],
	);
	if (touched.length === 1) {
		return touched[0] as number;
	}
	const shown = next.findIndex((scene) => scene.id === shownId);
	return shown >= 0
		? shown
		: Math.min(
				previous.findIndex((scene) => scene.id === shownId),
				next.length - 1,
			);
}

/**
 * Put a project document from the history back into the Studio: the code spine,
 * the export settings and the composition, as one load. What the user was doing
 * survives it: the scene being edited, the layer they had selected, and the
 * unsaved-work baseline, which an undo must not reset.
 */
export function applyStudioProjectDocument(document: ProjectDocumentV2): void {
	const { baselineFingerprint, currentStepIndex, snippet } = useSnippetStore.getState();
	const composition = useStudioCompositionStore.getState();
	const sceneIndex = sceneToShow(
		composition.toDocument().project.scenes,
		document.project.scenes,
		snippet.steps[currentStepIndex]?.id,
	);
	const release = holdStudioPersistence();
	try {
		useSnippetStore.getState().importFromJson(JSON.stringify(document));
		useSnippetStore.setState({ baselineFingerprint, currentStepIndex: Math.max(0, sceneIndex) });
		loadStudioCompositionDocument(adoptStoredSceneIds(document, readStudioCompositionSnapshot()));
		followTimelineSelection(composition.selectedBlockId);
	} finally {
		release();
	}
	// A redone media layer needs its bytes back in the preview; skips what is there.
	void registerStoredMedia(document).catch(() => undefined);
}

export interface StudioHistoryOptions {
	/** Null keeps the history in memory only (no IndexedDB, tests). */
	readonly storage: ProjectHistoryStorePort | null;
	readonly now?: () => number;
}

export interface StudioHistory {
	/** Subscribe to the Studio's stores; returns the stop. */
	start(): () => void;
	/** Record the document as it stands now, instead of on the next microtask. */
	capture(): void;
	/** Start over from the document as it stands: an import replaced the project. */
	reset(): void;
	undo(): boolean;
	redo(): boolean;
	canUndo(): boolean;
	canRedo(): boolean;
	/**
	 * The present entry. Equal across two calls exactly when no edit, undo or
	 * redo happened in between: what a local "undo this deletion" checks before
	 * handing the work to the history.
	 */
	present(): ProjectDocumentV2 | null;
	/** Write the pending history now (page hide, project switch, tests). */
	flush(): Promise<void>;
	/** Resolves once the stored history of the open project has been read. */
	ready(): Promise<void>;
	readonly useStore: ReturnType<typeof createAvailabilityStore>;
}

function createAvailabilityStore() {
	return create<{ readonly canUndo: boolean; readonly canRedo: boolean }>(() => ({
		canUndo: false,
		canRedo: false,
	}));
}

/**
 * One history for the open project, over the three stores that make up its
 * document (the code spine, the export settings, the composition). It records by
 * observing, not by being told: any edit that changes the saved document is an
 * entry, whichever control made it, and anything that does not (playback,
 * selection) is not. Kept per local project id, and in IndexedDB between visits.
 */
export function createStudioHistory({
	storage,
	now = () => Date.now(),
}: StudioHistoryOptions): StudioHistory {
	const useStore = createAvailabilityStore();
	let history: ProjectHistory | null = null;
	let applying = false;
	let queued = false;
	let dirty = false;
	let persistTimer: ReturnType<typeof setTimeout> | null = null;
	let loading: Promise<void> = Promise.resolve();

	const publish = () => {
		useStore.setState({
			canUndo: history !== null && canUndoProjectEdit(history),
			canRedo: history !== null && canRedoProjectEdit(history),
		});
	};

	const persistable = (candidate: ProjectHistory | null): candidate is ProjectHistory =>
		storage !== null && candidate !== null && candidate.projectId !== BOOT_PROJECT_ID;

	const write = (target: ProjectHistory): Promise<void> => {
		if (!persistable(target)) {
			return Promise.resolve();
		}
		return storage?.save(encodeProjectHistory(target)).catch(() => undefined) ?? Promise.resolve();
	};

	const flush = (): Promise<void> => {
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		if (!dirty || !history) {
			return Promise.resolve();
		}
		dirty = false;
		return write(history);
	};

	const schedulePersist = () => {
		if (!persistable(history)) {
			return;
		}
		dirty = true;
		if (persistTimer) {
			clearTimeout(persistTimer);
		}
		persistTimer = setTimeout(() => void flush(), PERSIST_DELAY_MS);
	};

	const readDocument = (): ProjectDocumentV2 | null => {
		try {
			return readStudioProjectDocument();
		} catch {
			// A Studio state the document format refuses (no scene code yet) is not
			// an entry; the next valid state is.
			return null;
		}
	};

	/** A project was opened under another id: its own history takes over. */
	const adopt = (document: ProjectDocumentV2) => {
		void flush();
		history = createProjectHistory(document);
		dirty = false;
		publish();
		const target = history;
		if (!persistable(target)) {
			return;
		}
		loading = (storage as ProjectHistoryStorePort)
			.load(target.projectId)
			.then((stored) => {
				const decoded = decodeProjectHistory(stored);
				// Edited in the meantime, or already left for another project: the
				// live history wins over the stored one.
				if (!decoded || history !== target || decoded.projectId !== target.projectId) {
					return;
				}
				// The stored present can lag the project (a crash before the last
				// write): the project as it opened becomes the newest entry.
				const opened = presentProjectDocument(target);
				history = recordProjectEdit(decoded, opened, now());
				dirty = history !== decoded;
				publish();
			})
			.catch(() => undefined);
	};

	const capture = () => {
		queued = false;
		if (applying || isStudioPersistenceHeld()) {
			return;
		}
		const document = readDocument();
		if (!document) {
			return;
		}
		if (!history || history.projectId !== document.project.id) {
			adopt(document);
			return;
		}
		const next = recordProjectEdit(history, document, now());
		if (next !== history) {
			history = next;
			publish();
			schedulePersist();
		}
	};

	const queueCapture = () => {
		if (!queued) {
			queued = true;
			queueMicrotask(capture);
		}
	};

	const move = (step: (current: ProjectHistory) => ProjectHistory): boolean => {
		capture();
		const current = history;
		if (!current) {
			return false;
		}
		const next = step(current);
		if (next === current) {
			return false;
		}
		applying = true;
		try {
			applyStudioProjectDocument(presentProjectDocument(next));
			history = next;
		} catch {
			// An entry the Studio cannot load stays where it was rather than half
			// applied; the stores were not replaced if the spine refused it.
			history = current;
			return false;
		} finally {
			applying = false;
		}
		const settled = readDocument();
		if (settled && history) {
			history = settleProjectHistory(history, settled);
		}
		publish();
		schedulePersist();
		return true;
	};

	return {
		useStore,
		start() {
			capture();
			const unsubscribers = [
				useSnippetStore.subscribe((state, previous) => {
					if (changed(state, previous, SNIPPET_CONTENT)) {
						queueCapture();
					}
				}),
				useExportStore.subscribe((state, previous) => {
					if (changed(state, previous, EXPORT_CONTENT)) {
						queueCapture();
					}
				}),
				useStudioCompositionStore.subscribe((state, previous) => {
					if (state.value !== previous.value) {
						queueCapture();
					}
				}),
				onStudioPersistenceRelease(queueCapture),
			];
			const onHide = () => {
				if (document.visibilityState === "hidden") {
					void flush();
				}
			};
			const onPageHide = () => void flush();
			if (typeof window !== "undefined") {
				document.addEventListener("visibilitychange", onHide);
				window.addEventListener("pagehide", onPageHide);
			}
			return () => {
				for (const unsubscribe of unsubscribers) {
					unsubscribe();
				}
				if (typeof window !== "undefined") {
					document.removeEventListener("visibilitychange", onHide);
					window.removeEventListener("pagehide", onPageHide);
				}
				void flush();
			};
		},
		capture,
		reset() {
			const document = readDocument();
			if (!document) {
				return;
			}
			// Written over the stored history too, or the next visit would undo
			// into the project the import replaced.
			history = createProjectHistory(document);
			publish();
			schedulePersist();
		},
		undo: () => move(undoProjectEdit),
		redo: () => move(redoProjectEdit),
		canUndo: () => history !== null && canUndoProjectEdit(history),
		canRedo: () => history !== null && canRedoProjectEdit(history),
		present: () => (history ? presentProjectDocument(history) : null),
		flush,
		ready: () => loading,
	};
}

/** The Studio's history: the one the shortcuts, the buttons and scene deletion share. */
export const studioHistory = createStudioHistory({
	storage: typeof indexedDB === "undefined" ? null : new IndexedDbProjectHistoryAdapter(),
});

export const useStudioHistoryStore = studioHistory.useStore;
