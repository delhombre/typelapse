import "@/app.css";
import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { LandingPage } from "@/presentation/landing/landing-page";
import { MotionConfig } from "motion/react";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

const StudioRoute = lazy(() =>
	import("@/presentation/studio/studio-route").then(({ StudioRoute: RouteComponent }) => ({
		default: RouteComponent,
	})),
);

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
					<Route
						path="/app"
						element={
							<RouteErrorBoundary>
								<Suspense fallback={<div className="min-h-dvh bg-paper" aria-busy="true" />}>
									<StudioRoute />
								</Suspense>
							</RouteErrorBoundary>
						}
					/>
				</Routes>
			</BrowserRouter>
		</MotionConfig>
	</StrictMode>,
);
