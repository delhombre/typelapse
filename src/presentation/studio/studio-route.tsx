import "@/presentation/studio-camera.css";
import { studioDocumentTitle } from "@/application/project/document-title";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { StudioEditor } from "@/presentation/components/editor/studio-editor";
import { BillingReturnBoot } from "@/presentation/components/layout/billing-return-boot";
import { ImportIntentBoot } from "@/presentation/components/layout/import-intent-boot";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { StudioBootGuard } from "@/presentation/components/layout/studio-boot-guard";
import { StudioCompositionBridge } from "@/presentation/components/layout/studio-composition-bridge";
import { StudioPersistence } from "@/presentation/components/layout/studio-persistence";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { NoticeHost } from "@/presentation/components/ui/notice-host";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { useRouteHead } from "@/presentation/hooks/use-route-head";
import { setHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { followStudioTheme, useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { useEffect } from "react";

setHighlighter(shikiAdapter);

const initialMode = useThemeModeStore.getState().mode;
document.documentElement.classList.toggle("dark", initialMode === "dark");

useSnippetStore.getState().rebuildPlan();

/** The complete Studio lives behind the /app route chunk. Nothing in this
 * module is evaluated while a visitor is only reading the landing page. */
export function StudioRoute() {
	// The tab names the project: "Studio" until it has a name of its own.
	useRouteHead("studio", studioDocumentTitle(useSnippetStore((state) => state.snippet.title)));
	// In an effect, not at module load: arriving from the landing, its cleanup
	// hands `theme-color` back to index.html's values after this module has run.
	// System follows the OS only while the studio is here.
	useEffect(() => followStudioTheme(), []);

	return (
		<StudioTooltipProvider>
			<NoticeHost />
			<StudioBootGuard>
				<StudioPersistence />
				<StudioCompositionBridge />
				<ImportIntentBoot />
				<BillingReturnBoot />
				<ResponsiveShell
					editor={<StudioEditor />}
					sceneInspector={<SceneInspector />}
					stepBuilder={<StepBuilder />}
					preview={<LivePreview />}
				/>
			</StudioBootGuard>
		</StudioTooltipProvider>
	);
}
