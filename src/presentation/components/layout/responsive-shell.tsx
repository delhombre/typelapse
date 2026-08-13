import { useKeyboardShortcuts } from "@/presentation/hooks/use-keyboard-shortcuts";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { type ReactNode, useEffect } from "react";
import { MobileShell } from "./mobile-shell";
import { SceneShell } from "./scene-shell";

interface ResponsiveShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

/**
 * Chooses the workspace layout at the lg breakpoint: the scene on desktop, the
 * same scene folded to one column — with the code card as a Vaul bottom sheet —
 * below it. State lives in the shared stores, so it carries across a switch.
 */
export function ResponsiveShell(props: ResponsiveShellProps) {
	useKeyboardShortcuts();
	const isDesktop = useIsDesktop();

	// Leaving the studio disarms record mode: clears the pending debounce timer
	// and flushes a trailing step, so nothing captures into a stale snippet.
	useEffect(() => {
		return () => {
			useSnippetStore.getState().stopRecording();
		};
	}, []);

	return isDesktop ? <SceneShell {...props} /> : <MobileShell {...props} />;
}
