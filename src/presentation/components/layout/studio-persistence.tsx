import { nextUntitledTitle } from "@/application/project/local-project-library";
import type { ProjectPayload } from "@/application/project/project-payload";
import { useStudioBoot } from "@/presentation/components/layout/studio-boot-guard";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	createLocalProject,
	ensureActiveLocalProject,
	readLocalProjects,
	saveActiveLocalProject,
} from "@/presentation/utils/local-project-storage";
import {
	type DraftAutosave,
	hasArrivalPayload,
	restoreDraftOnBoot,
	startDraftAutosave,
} from "@/presentation/utils/studio-draft";
import { useEffect, useRef, useState } from "react";

/**
 * Makes the studio survive: restores last session's draft on arrival, autosaves
 * as you work, and holds the door on unload while there are unsaved edits.
 * Renders nothing.
 *
 * Precedence on boot is decided in `studio-draft.ts` from the hash the page
 * ARRIVED with: a `#import=` deep link or a `#share=` link wins over the draft.
 */
export function StudioPersistence() {
	const { held, guardRestore, hasCrashed } = useStudioBoot();
	// Captured at render, before any effect runs: ImportIntentBoot consumes and
	// scrubs `#import=` in its own mount effect, and the restore decision must
	// see the hash as it stood on arrival, whatever order the effects fire in.
	const [arrivalHash] = useState(() => window.location.hash);
	// Restore exactly once per mounted studio; StrictMode re-runs the effect,
	// and the second restore would fight the import the first arrival started.
	const restoredRef = useRef(false);
	const autosaveRef = useRef<DraftAutosave | null>(null);

	useEffect(() => {
		// The boot guard is trying the default project: storage stays exactly as
		// the person left it until the guard decides what to set aside.
		if (held) {
			return;
		}
		// Read BEFORE the restore, so it is the state the studio actually booted
		// with: the autosave refuses to write this back, and a link that promised
		// content and then failed to deliver any can no longer flush an empty
		// studio over the draft it skipped for.
		const pristine = JSON.stringify(useSnippetStore.getState().toProjectPayload());
		const arrival = hasArrivalPayload(arrivalHash);
		if (!restoredRef.current) {
			restoredRef.current = true;
			guardRestore(() => restoreDraftOnBoot(arrivalHash));
			// A link that carries content opens a project of its own, before the
			// composition restore reads which project is active: the project that
			// was open keeps its code, layers and history. The import names it.
			if (arrival) {
				createLocalProject({
					...useSnippetStore.getState().toProjectPayload(),
					title: nextUntitledTitle(readLocalProjects().projects.map((r) => r.project.title)),
				});
			}
		}
		const current = useSnippetStore.getState().toProjectPayload();
		ensureActiveLocalProject(current);
		// A plain visit may have restored a newer single-draft snapshot. Sync it
		// into the active project immediately. A content-bearing link gets to load
		// first; its first real state change will be caught by the autosave below.
		if (!arrival) {
			saveActiveLocalProject(current);
		}
		const autosave = startDraftAutosave(pristine, (json) => {
			saveActiveLocalProject(JSON.parse(json) as ProjectPayload);
		});
		autosaveRef.current = autosave;
		return () => {
			// Leaving the studio (say, back to the landing) is not a crash: write
			// what is pending so the next visit finds it. A crash is: what is in
			// memory is what threw, and writing it would replay it on every reload.
			if (!hasCrashed()) {
				autosave.flush();
			}
			autosave.stop();
			autosaveRef.current = null;
		};
	}, [arrivalHash, held, guardRestore, hasCrashed]);

	useEffect(() => {
		if (held) {
			return;
		}
		const guard = (event: BeforeUnloadEvent) => {
			// Whatever happens next, the draft is current: the debounce window must
			// not be a window in which closing the tab loses the last edit.
			autosaveRef.current?.flush();
			if (useSnippetStore.getState().hasUnsavedEdits()) {
				event.preventDefault();
			}
		};
		window.addEventListener("beforeunload", guard);
		return () => window.removeEventListener("beforeunload", guard);
	}, [held]);

	return null;
}
