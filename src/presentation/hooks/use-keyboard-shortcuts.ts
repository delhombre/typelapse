import { matchShortcut } from "@/application/shortcuts/studio-shortcuts";
import { feedback } from "@/presentation/haptics";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	allowsSingleKeyShortcut,
	isEditableEventTarget,
} from "@/presentation/utils/editable-target";
import { useEffect } from "react";

/**
 * True while a modal dialog is on screen.
 *
 * A modal owns every key it can see: driving the animation underneath an open
 * gallery would be a surprise, and Escape has to reach the dialog that owns it
 * rather than pausing playback behind it.
 */
function isModalOpen(): boolean {
	return document.querySelector("dialog[open]") !== null;
}

/**
 * True while the phone's loupe is up (components/layout/code-loupe.tsx). It owns
 * the keys as a modal does: an arrow pans the code rather than changing the
 * scene under it, and Escape closes it rather than pausing the video it shows.
 */
function isLoupeOpen(): boolean {
	return document.querySelector(".sc-stage-slot[data-loupe]") !== null;
}

/**
 * True when the studio's bare-key shortcuts must stand down: while a modal or
 * the phone's loupe is open, and while the focused surface is taking text.
 *
 * This is the state-shaped question, for callers that have no keystroke in hand.
 * The handler below asks the event-shaped one instead, because an event knows
 * its own origin and `document.activeElement` only knows where focus landed.
 * Both route through the same capability checks, so they cannot drift apart.
 */
export function areShortcutsSuppressed(): boolean {
	return (
		isModalOpen() || isLoupeOpen() || isEditableEventTarget({ target: document.activeElement })
	);
}

export function useKeyboardShortcuts(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const store = useSnippetStore.getState();

			// A modal owns every key while it is open, including the chord below
			// that otherwise fires mid-typing: capturing a step from inside the
			// gallery would commit work the user cannot see.
			if (isModalOpen() || isLoupeOpen()) {
				return;
			}

			// The keys are one table (application/shortcuts/studio-shortcuts.ts), which the
			// Help sheet lists too; what follows is what each one does, and whether the
			// place it was pressed in lets it.
			const shortcut = matchShortcut(e);
			if (shortcut === null) {
				return;
			}

			// Ctrl+Enter / Cmd+Enter: capture a scene. A chord is unambiguous, so this
			// one deliberately works while typing: it is the whole point of it.
			if (shortcut === "capture-scene") {
				e.preventDefault();
				store.captureStep();
				return;
			}

			// The project history. Inside a text surface the chord is that surface's
			// own undo: a number field steps back its digits, and Monaco keeps the
			// code buffer's history, which the project then records as one edit.
			if (shortcut === "undo" || shortcut === "redo") {
				if (isEditableEventTarget(e)) {
					return;
				}
				e.preventDefault();
				if (shortcut === "undo" ? studioHistory.undo() : studioHistory.redo()) {
					feedback("commit");
				}
				return;
			}

			// Everything below is a bare key, which the editor has the stronger
			// claim to whenever the keystroke came from a text surface. The guard
			// reads the event's own path rather than document.activeElement, and
			// asks whether the surface takes text rather than what it is called:
			// Monaco types through an EditContext div that no tag-name check sees.
			if (!allowsSingleKeyShortcut(e)) {
				return;
			}

			switch (shortcut) {
				case "play-pause": {
					e.preventDefault();
					if (store.isPlaying) {
						store.pause();
					} else {
						store.play();
					}
					break;
				}

				case "previous-scene": {
					e.preventDefault();
					if (store.currentStepIndex > 0) {
						store.setCurrentStepIndex(store.currentStepIndex - 1);
					}
					break;
				}

				case "next-scene": {
					e.preventDefault();
					const maxIndex = store.snippet.steps.length - 1;
					if (store.currentStepIndex < maxIndex) {
						store.setCurrentStepIndex(store.currentStepIndex + 1);
					}
					break;
				}

				case "pause": {
					e.preventDefault();
					if (store.isPlaying) {
						store.pause();
					}
					break;
				}

				default:
					break;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);
}
