import "@/presentation/studio-camera.css";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { SceneInspector, StepBuilder } from "@/presentation/components/editor/step-builder";
import { ImportIntentBoot } from "@/presentation/components/layout/import-intent-boot";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { StudioPersistence } from "@/presentation/components/layout/studio-persistence";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { NoticeHost } from "@/presentation/components/ui/notice-host";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { setHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";

setHighlighter(shikiAdapter);

const initialMode = useThemeModeStore.getState().mode;
document.documentElement.classList.toggle("dark", initialMode === "dark");

useSnippetStore.getState().rebuildPlan();

/** The complete Studio lives behind the /app route chunk. Nothing in this
 * module is evaluated while a visitor is only reading the landing page. */
export function StudioRoute() {
	return (
		<StudioTooltipProvider>
			<StudioPersistence />
			<ImportIntentBoot />
			<NoticeHost />
			<ResponsiveShell
				editor={<CodeEditor />}
				sceneInspector={<SceneInspector />}
				stepBuilder={<StepBuilder />}
				preview={<LivePreview />}
			/>
		</StudioTooltipProvider>
	);
}
