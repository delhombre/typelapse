// Must be evaluated before anything that reads the clock. Motion caches
// requestAnimationFrame and Date.now on import, and a cached reference keeps
// the real clock, so Lapse's slow-motion would silently do nothing. Aliased to
// a no-op for production builds in vite.config.ts.
import "@aiforui/lapse/install";
import "@/app.css";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { LandingPage } from "@/presentation/landing/landing-page";
import { setHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { Lapse, getSharedEngine } from "@aiforui/lapse";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

setHighlighter(shikiAdapter);

// Dev only: hand the shared engine to the console and to scripted checks, so an
// animation can be slowed down and measured without clicking through the panel.
if (import.meta.env.DEV) {
	(window as unknown as { lapse: unknown }).lapse = { getSharedEngine };
}

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
			</Routes>
		</BrowserRouter>
		{/* Dev only. Vite substitutes `false` at build time, so the panel and its
		    import are tree-shaken out of the production bundle. */}
		{import.meta.env.DEV && <Lapse />}
	</StrictMode>,
);
