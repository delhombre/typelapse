import { useKeyboardShortcuts } from "@/presentation/hooks/use-keyboard-shortcuts";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { type ReactNode, useEffect } from "react";
import { MobileShell } from "./mobile-shell";
import { SceneShell } from "./scene-shell";

interface ResponsiveShellProps {
	editor: ReactNode;
	sceneInspector: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

/**
 * Chooses the workspace layout at the first width where editor, video and
 * inspector can all remain useful. Below that content breakpoint, the same
 * scene folds to one column with the code card as a Vaul bottom sheet. State
 * lives in the shared stores, so it carries across a switch.
 */
export function ResponsiveShell({
	editor,
	sceneInspector,
	stepBuilder,
	preview,
}: ResponsiveShellProps) {
	useKeyboardShortcuts();
	const isDesktop = useIsDesktop();

	// Leaving the studio disarms record mode: clears the pending debounce timer
	// and flushes a trailing step, so nothing captures into a stale snippet.
	useEffect(() => {
		return () => {
			useSnippetStore.getState().stopRecording();
		};
	}, []);

	return isDesktop ? (
		<SceneShell editor={editor} sceneInspector={sceneInspector} preview={preview} />
	) : (
		<MobileShell editor={editor} stepBuilder={stepBuilder} preview={preview} />
	);
}
