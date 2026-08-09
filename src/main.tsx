import "@/app.css";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { LandingPage } from "@/presentation/landing/landing-page";
import { setHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
// proto:hero — throwaway exploration, delete with src/proto
import { HeroProto } from "@/proto/hero/harness";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

setHighlighter(shikiAdapter);

// Initialize theme mode from system preference (the /app route respects this;
// the landing forces its own dark palette).
const initialMode = useThemeModeStore.getState().mode;
document.documentElement.classList.toggle("dark", initialMode === "dark");

// Build the initial magic-move plan (retried once the highlighter is ready).
useSnippetStore.getState().rebuildPlan();

function Studio() {
	return (
		<ResponsiveShell
			editor={<CodeEditor />}
			stepBuilder={<StepBuilder />}
			preview={<LivePreview />}
		/>
	);
}

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element not found");
}

createRoot(root).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<LandingPage />} />
				<Route path="/app" element={<Studio />} />
				{/* proto:hero — throwaway exploration route, delete with src/proto */}
				<Route path="/proto/hero" element={<HeroProto />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
);
