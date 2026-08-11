import "@/app.css";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { LandingPage } from "@/presentation/landing/landing-page";
import { setHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { MotionConfig } from "motion/react";
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
		{/* The app-wide reduced-motion floor. The CSS rule in app.css catches CSS
		    transitions, but Motion's springs run in JS and sail straight past it:
		    12 studio files animate with no useReducedMotion guard of their own.
		    `reducedMotion="user"` strips transform and layout animations for
		    anyone asking for less motion while keeping opacity and colour — the
		    same doctrine as the CSS rule. Components with hand-rolled reduce
		    variants keep them; this is the net under everything else. */}
		<MotionConfig reducedMotion="user">
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<LandingPage />} />
					<Route path="/app" element={<Studio />} />
				</Routes>
			</BrowserRouter>
		</MotionConfig>
	</StrictMode>,
);
