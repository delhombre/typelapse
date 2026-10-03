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

import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	readStudioCompositionSnapshot,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";

/** True when replacing the project would discard work: code edits or layers. */
export function hasStudioWorkToLose(): boolean {
	return useSnippetStore.getState().hasUnsavedEdits() || hasAuthoredMultimedia();
}

/**
 * Load a project document into both stores. Throws a user-facing Error on an
 * unusable document before either store changes, because `importFromJson`
 * validates everything ahead of its first write.
 */
export function openStudioProjectDocument(json: string): void {
	useSnippetStore.getState().importFromJson(json);
	// Rebuilt from the snippet that was just loaded, so the two stores agree by
	// construction. loadDocument also drops the composition's undo history: undo
	// must not walk back into the project that was closed.
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
}
