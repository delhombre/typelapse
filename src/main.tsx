import "@/app.css";
import { ShikiAdapter } from "@/infrastructure/highlighting/shiki.adapter";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { setHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";

const shikiAdapter = new ShikiAdapter();
setHighlighter(shikiAdapter);

// Initialize theme mode from system preference
const initialMode = useThemeModeStore.getState().mode;
document.documentElement.classList.toggle("dark", initialMode === "dark");

// Build the initial magic-move plan (retried once the highlighter is ready)
useSnippetStore.getState().rebuildPlan();

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		<ResponsiveShell
			editor={<CodeEditor />}
			stepBuilder={<StepBuilder />}
			preview={<LivePreview />}
		/>
	</StrictMode>,
);
