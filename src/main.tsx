import "@/app.css";
import { AppRoutes } from "@/app-routes";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

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
				<AppRoutes />
			</BrowserRouter>
		</MotionConfig>
	</StrictMode>,
);
