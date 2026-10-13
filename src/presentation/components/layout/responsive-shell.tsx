import { useKeyboardShortcuts } from "@/presentation/hooks/use-keyboard-shortcuts";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { studioHistory } from "@/presentation/stores/project-history.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { StudioSkeleton } from "@/presentation/studio/studio-skeleton";
import { scenesFromArrival } from "@/presentation/utils/shell-preferences";
import { type ReactNode, useEffect, useState } from "react";
import { MobileShell } from "./mobile-shell";
import { SceneShell } from "./scene-shell";

interface ResponsiveShellProps {
	editor: ReactNode;
	sceneInspector: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

/**
 * How many scenes the project opens with. A link's own (`#share=`) or the one
 * it is about to bring (`#import=`) is read from the hash the page arrived with:
 * those are opened by controls that run after this one (or inside the shell,
 * which is not mounted yet), and the import clears its hash in its own effect.
 * Otherwise the store holds the project, restored from the draft by now.
 */
function scenesAtOpening(arrivalHash: string): number {
	return scenesFromArrival(arrivalHash) ?? useSnippetStore.getState().snippet.steps.length;
}

/**
 * Chooses the workspace layout at the first width where editor, video and
 * inspector can all remain useful. Below that content breakpoint, the same
 * scene folds to one column with the code card as a Vaul bottom sheet. State
 * lives in the shared stores, so it carries across a switch.
 *
 * Where the studio opens depends on whether the project has a scene (gate five
 * D3), and a returning visitor's project is put back by an effect, after the
 * first render. So the shell waits for those effects (its siblings' run before
 * this one) and draws the studio's outline meanwhile, the
 * same picture the lazy chunk's fallback draws: the layout then mounts once, in
 * the mode the restored project asks for, instead of opening on the default
 * project's and moving, or paying for an editor a project with scenes never
 * asked for.
 */
export function ResponsiveShell({
	editor,
	sceneInspector,
	stepBuilder,
	preview,
}: ResponsiveShellProps) {
	useKeyboardShortcuts();
	const isDesktop = useIsDesktop();
	// How many scenes the project had when the studio finished booting.
	const [arrivalHash] = useState(() => window.location.hash);
	const [openedWith, setOpenedWith] = useState<number | null>(null);
	useEffect(() => setOpenedWith(scenesAtOpening(arrivalHash)), [arrivalHash]);

	// The project history records while the studio is open, on either layout.
	useEffect(() => studioHistory.start(), []);

	// Leaving the studio disarms record mode: clears the pending debounce timer
	// and flushes a trailing step, so nothing captures into a stale snippet.
	useEffect(() => {
		return () => {
			useSnippetStore.getState().stopRecording();
		};
	}, []);

	if (openedWith === null) {
		return <StudioSkeleton />;
	}

	return isDesktop ? (
		<SceneShell
			editor={editor}
			sceneInspector={sceneInspector}
			preview={preview}
			sceneCount={openedWith}
		/>
	) : (
		<MobileShell
			editor={editor}
			stepBuilder={stepBuilder}
			preview={preview}
			sceneCount={openedWith}
		/>
	);
}
