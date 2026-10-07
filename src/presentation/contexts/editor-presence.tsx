import { type ReactNode, createContext, useContext, useState } from "react";

/**
 * Whether the code editor has ever been on screen.
 *
 * Monaco is about a megabyte of script plus a language worker, and a visit
 * that never opens the editor (Preview on a desktop, the phone sheet resting
 * at its peek) has no use for any of it. The shell that owns the slot says
 * when it is shown; this remembers that it was. It never goes back to false:
 * unmounting Monaco on every fold would make each unfold rebuild it and lose
 * the cursor, and the fold is a transform and an opacity precisely so it costs
 * nothing.
 *
 * The default is "mounted", so an editor rendered outside a shell (a test, a
 * future route) still shows up.
 */
const EditorPresenceContext = createContext(true);

export function EditorPresence({ shown, children }: { shown: boolean; children: ReactNode }) {
	const [everShown, setEverShown] = useState(shown);
	// Adjusted during render, not in an effect: the first shown render already
	// mounts the editor instead of committing an empty slot first.
	if (shown && !everShown) {
		setEverShown(true);
	}
	return <EditorPresenceContext value={shown || everShown}>{children}</EditorPresenceContext>;
}

/** True once the slot this editor sits in has been shown (see `EditorPresence`). */
export function useEditorMounted(): boolean {
	return useContext(EditorPresenceContext);
}
