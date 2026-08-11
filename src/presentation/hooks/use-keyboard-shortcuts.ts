import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useEffect } from "react";

/**
 * True when the studio's bare-key shortcuts must stand down: while the user is
 * typing, and while a modal dialog is open. Space, arrows and Escape belong to
 * whatever is in front; driving the animation underneath a gallery would be a
 * surprise, and Escape has to reach the dialog that owns it.
 */
export function areShortcutsSuppressed(): boolean {
	return isEditableElementFocused() || document.querySelector("dialog[open]") !== null;
}

/**
 * Returns true if the active element is an input, textarea, contenteditable,
 * or inside a Monaco editor: meaning keyboard shortcuts should be suppressed.
 */
function isEditableElementFocused(): boolean {
	const el = document.activeElement;
	if (!el) {
		return false;
	}

	const tag = el.tagName.toLowerCase();
	if (tag === "input" || tag === "textarea" || tag === "select") {
		return true;
	}

	if (el instanceof HTMLElement && el.isContentEditable) {
		return true;
	}

	// Monaco editor wraps its input in elements inside .monaco-editor
	if (el.closest(".monaco-editor")) {
		return true;
	}

	return false;
}

export function useKeyboardShortcuts(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const store = useSnippetStore.getState();

			// A modal owns every key while it is open, including the one shortcut
			// that otherwise fires mid-typing.
			if (document.querySelector("dialog[open]") !== null) {
				return;
			}

			// Ctrl+Enter / Cmd+Enter: capture step (works even when typing)
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				store.captureStep();
				return;
			}

			// All remaining shortcuts are suppressed when an editable element is focused
			if (areShortcutsSuppressed()) {
				return;
			}

			switch (e.key) {
				case " ": {
					e.preventDefault();
					if (store.isPlaying) {
						store.pause();
					} else {
						store.play();
					}
					break;
				}

				case "ArrowLeft": {
					e.preventDefault();
					if (store.currentStepIndex > 0) {
						store.setCurrentStepIndex(store.currentStepIndex - 1);
					}
					break;
				}

				case "ArrowRight": {
					e.preventDefault();
					const maxIndex = store.snippet.steps.length - 1;
					if (store.currentStepIndex < maxIndex) {
						store.setCurrentStepIndex(store.currentStepIndex + 1);
					}
					break;
				}

				case "Escape": {
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
