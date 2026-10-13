/**
 * Opening a whole project document (a project file, a template) in the Studio.
 *
 * The Studio is two stores: the code snippet and the V2 composition that holds
 * text, media and audio layers on top of it. `importFromJson` replaces only the
 * first. The composition is then merely synchronized, which is right for edits
 * (a new scene inherits the layers of the one before it) and wrong for a load:
 * the previous project's live-scene layers were cloned into every scene of the
 * opened file, and its audio cues and assets came along too. A document load
 * therefore replaces the composition as well, and asks first when that throws
 * away authored layers the snippet's own "unsaved edits" check cannot see.
 */

import { pruneUnreferencedAssets } from "@/application/project/multimedia-authoring";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import {
	adoptStoredSceneIds,
	createStudioCompositionDocument,
	storedSceneIdsFor,
} from "@/application/project/studio-composition";
import { openStudioDocument } from "@/application/project/studio-document";
import { Step } from "@/domain/entities/step";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	holdStudioPersistence,
	loadStudioCompositionDocument,
	readStudioCompositionSnapshot,
	readStudioProjectDocument,
	studioSceneIdAt,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import {
	studioLocalLibrary,
	studioMediaRegistry,
	studioMediaSourceFactory,
} from "@/presentation/studio-media-runtime";

/** True when replacing the project would discard work: code edits or layers. */
export function hasStudioWorkToLose(): boolean {
	return useSnippetStore.getState().hasUnsavedEdits() || hasAuthoredMultimedia();
}

/** The project file "Export project file" writes: the V2 document, media by reference. */
export function studioProjectFileJson(): string {
	return JSON.stringify(readStudioProjectDocument(), null, 2);
}

function withProjectId(document: ProjectDocumentV2, id: string): ProjectDocumentV2 {
	return document.project.id === id
		? document
		: { ...document, project: { ...document.project, id } };
}

/**
 * Give the preview a source for every asset whose bytes this browser holds.
 * An asset without bytes (a file from another device, a cleared browser) is
 * skipped and its layer shows its "Media unavailable" state.
 */
export async function registerStoredMedia(
	document: ProjectDocumentV2,
	isActive: () => boolean = () => true,
): Promise<void> {
	for (const asset of document.project.assets) {
		if (studioMediaRegistry.resolve(asset.id)) {
			continue;
		}
		let content: Awaited<ReturnType<typeof studioLocalLibrary.loadAsset>> = null;
		try {
			content = await studioLocalLibrary.loadAsset({
				projectId: document.project.id,
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
}

/**
 * Load a project document (V2, or a legacy V1 file) into both stores, inside
 * the project the studio has open: the file's own id is replaced, so opening a
 * file never writes over another local project. Throws a user-facing Error on
 * an unusable document before either store changes.
 */
export function openStudioProjectDocument(json: string): void {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		throw new Error("Invalid JSON format");
	}
	const opened = openStudioDocument(data);
	const document = withProjectId(
		opened.document,
		useStudioCompositionStore.getState().value.project.id,
	);
	const release = holdStudioPersistence();
	try {
		useSnippetStore.getState().importFromJson(json);
		// The steps took the file's scene ids, so its layers land on them. A live
		// code project shows one scene under the Studio's live id; re-keying adopts
		// it. loadDocument also drops the composition's undo history: undo must not
		// walk back into the project that was closed.
		loadStudioCompositionDocument(adoptStoredSceneIds(document, readStudioCompositionSnapshot()));
	} finally {
		release();
	}
	void registerStoredMedia(document).catch(() => undefined);
}

/**
 * The id the studio stored its one composition under before compositions were
 * keyed by local project. Read once, at the first boot after that change.
 */
export const LEGACY_STUDIO_PROJECT_ID = "studio-project";

/**
 * Put one local project's stored layers, media and audio on the code the
 * snippet already holds, under that project's id. A project with nothing
 * stored gets a composition of its code alone, never the previous project's
 * layers. `adoptLegacy` hands the old single composition to this project if it
 * is still there; only the boot asks for it. `guard` runs the moment the stored
 * composition goes on screen (and only that moment, not the reads before it):
 * the boot passes the boot guard's, so a stored document that throws the studio
 * is set aside rather than replayed.
 */
export async function restoreStudioProject(
	projectId: string,
	isActive: () => boolean = () => true,
	options: {
		readonly adoptLegacy?: boolean;
		readonly guard?: (restore: () => boolean) => boolean;
	} = {},
): Promise<void> {
	let stored = await studioLocalLibrary.loadProject(projectId);
	if (!stored && options.adoptLegacy && projectId !== LEGACY_STUDIO_PROJECT_ID) {
		stored = await studioLocalLibrary.moveProject(LEGACY_STUDIO_PROJECT_ID, projectId);
	}
	if (!isActive()) {
		return;
	}
	if (!stored) {
		restoreBlankStudioProject(projectId);
		return;
	}
	// History is empty after a load, so an asset no layer or cue references can
	// never come back: drop it before any object URL is made for its bytes. The
	// next autosave writes the document without it.
	const document = pruneUnreferencedAssets(withProjectId(stored, projectId));
	const leaving = useStudioCompositionStore.getState().value.project.assets;
	await registerStoredMedia(document, isActive);
	if (!isActive()) {
		return;
	}
	// The project being left keeps no preview URL for media this one does not show.
	const kept = new Set(document.project.assets.map((asset) => asset.id));
	for (const asset of leaving) {
		if (!kept.has(asset.id)) {
			studioMediaRegistry.revoke(asset.id);
		}
	}
	const guard = options.guard ?? ((restore: () => boolean) => restore());
	guard(() => {
		// The code was loaded from the project's spine, whose step ids need not be
		// the ones the layers and the history were saved under: the steps take the
		// stored ids, so the composition loads exactly as it was stored.
		takeStoredSceneIds(document);
		loadStudioCompositionDocument(adoptStoredSceneIds(document, readStudioCompositionSnapshot()));
		// loadDocument resets selection to the first scene; follow the Studio's.
		const sceneId = studioSceneIdAt(useSnippetStore.getState().currentStepIndex);
		const composition = useStudioCompositionStore.getState();
		if (composition.value.project.scenes.some((scene) => scene.id === sceneId)) {
			composition.selectScene(sceneId);
		}
		return true;
	});
}

/** Rename the snippet's steps to the stored scene ids they match; not an edit. */
function takeStoredSceneIds(document: ProjectDocumentV2): void {
	const { snippet } = useSnippetStore.getState();
	const ids = storedSceneIdsFor(document, readStudioCompositionSnapshot().scenes);
	if (snippet.steps.length === 0 || snippet.steps.every((step, index) => step.id === ids[index])) {
		return;
	}
	let renamed = snippet;
	for (const step of snippet.steps) {
		renamed = renamed.removeStep(step.id);
	}
	snippet.steps.forEach((step, index) => {
		renamed = renamed.addStep(
			Step.create({
				id: ids[index] ?? step.id,
				code: step.code,
				duration: step.duration,
				highlightRanges: [...step.highlightRanges],
				annotation: step.annotation,
				sceneBreak: step.sceneBreak,
			}),
		);
	});
	useSnippetStore.setState({ snippet: renamed });
}

/** A composition of the code the snippet holds and nothing else, under this id. */
export function restoreBlankStudioProject(projectId: string): void {
	loadStudioCompositionDocument(
		createStudioCompositionDocument({ ...readStudioCompositionSnapshot(), projectId }),
	);
}

/**
 * An import (a pull request, a diff, a commit, a code link, a paste) replaces
 * the project the way opening a file does: the code the snippet now holds and
 * nothing else, under the open project's id. The old layers used to stay, and
 * were cloned into every scene of the import; keeping them would be a feature
 * to offer, not a default.
 */
export function replaceStudioCompositionWithCode(): void {
	const leaving = useStudioCompositionStore.getState().value.project;
	for (const asset of leaving.assets) {
		studioMediaRegistry.revoke(asset.id);
	}
	restoreBlankStudioProject(leaving.id);
}

/** Store the open project's V2 document under its local project id. */
export async function saveStudioProject(): Promise<void> {
	await studioLocalLibrary.saveProject(readStudioProjectDocument());
}
