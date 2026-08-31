import "@/app.css";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { CodeEditor } from "@/presentation/components/editor/code-editor";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { ImportIntentBoot } from "@/presentation/components/layout/import-intent-boot";
import { ResponsiveShell } from "@/presentation/components/layout/responsive-shell";
import { StudioPersistence } from "@/presentation/components/layout/studio-persistence";
import { MultimediaStudio } from "@/presentation/components/multimedia/multimedia-studio";
import { LivePreview } from "@/presentation/components/preview/live-preview";
import { NoticeHost } from "@/presentation/components/ui/notice-host";
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

function LegacyCodeStudio() {
	return (
		<>
			{/* Restores last session's draft, autosaves this one, guards unload.
			    Reads the arrival hash at render, so it stays correct whatever order
			    the boot effects fire in: a deep link or share link wins over the
			    draft, because whoever opened one asked for what it carries. */}
			<StudioPersistence />
			{/* Loads whatever the landing hero was pasted, when the studio was opened
			    from it. Renders nothing on a normal visit. */}
			<ImportIntentBoot />
			{/* The studio's one feedback surface: import errors, refused uploads. */}
			<NoticeHost />
			<ResponsiveShell
				editor={<CodeEditor />}
				stepBuilder={<StepBuilder />}
				preview={<LivePreview />}
			/>
		</>
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
					<Route path="/app" element={<MultimediaStudio />} />
					<Route path="/app/code" element={<LegacyCodeStudio />} />
				</Routes>
			</BrowserRouter>
		</MotionConfig>
	</StrictMode>,
);
