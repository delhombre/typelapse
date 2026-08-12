import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { allowsSingleKeyShortcut } from "@/presentation/utils/editable-target";
import { useEffect } from "react";

export function useKeyboardShortcuts(): void {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const store = useSnippetStore.getState();

			// Ctrl+Enter / Cmd+Enter: capture step. A chord is unambiguous, so this
			// one deliberately works while typing — it is the whole point of it.
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				store.captureStep();
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
