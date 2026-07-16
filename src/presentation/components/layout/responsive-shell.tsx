import { useKeyboardShortcuts } from "@/presentation/hooks/use-keyboard-shortcuts";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { type ReactNode, useEffect } from "react";
import { AppShell } from "./app-shell";
import { MobileShell } from "./mobile-shell";

interface ResponsiveShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

/**
 * Chooses the workspace layout at the lg breakpoint: the fixed two-column split
 * on desktop, the full-screen preview + Vaul bottom sheet on mobile/tablet.
 * State lives in the shared stores, so it carries across a layout switch.
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

	return isDesktop ? <AppShell {...props} /> : <MobileShell {...props} />;
}
