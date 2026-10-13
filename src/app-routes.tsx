import { APP_PATHS } from "@/application/routing/app-paths";
import { NotFound } from "@/presentation/components/ui/not-found";
import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { LandingErrorShell } from "@/presentation/landing/landing-error-shell";
import { LandingPage } from "@/presentation/landing/landing-page";
import { StudioSkeleton } from "@/presentation/studio/studio-skeleton";
import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

const StudioRoute = lazy(() =>
	import("@/presentation/studio/studio-route").then(({ StudioRoute: RouteComponent }) => ({
		default: RouteComponent,
	})),
);

const PricingRoute = lazy(() =>
	import("@/presentation/landing/pricing/pricing-page").then(({ PricingPage }) => ({
		default: PricingPage,
	})),
);

/** The app's addresses, apart from the router so a test can mount them on any path. */
export function AppRoutes() {
	return (
		<Routes>
			<Route
				path={APP_PATHS.landing}
				element={
					<RouteErrorBoundary
						heading="This page did not load"
						message="Reload to try again, or go straight to the studio."
						offerStudio
						Shell={LandingErrorShell}
					>
						<LandingPage />
					</RouteErrorBoundary>
				}
			/>
			<Route
				path={APP_PATHS.studio}
				element={
					<RouteErrorBoundary>
						<Suspense fallback={<StudioSkeleton />}>
							<StudioRoute />
						</Suspense>
					</RouteErrorBoundary>
				}
			/>
			<Route
				path={APP_PATHS.pricing}
				element={
					<RouteErrorBoundary
						heading="This page did not load"
						message="Reload to try again, or go straight to the studio."
						offerStudio
						Shell={LandingErrorShell}
					>
						{/* Paper while the chunk loads: the same ground the page is drawn on, so nothing flashes. */}
						<Suspense fallback={<div className="min-h-dvh bg-paper" />}>
							<PricingRoute />
						</Suspense>
					</RouteErrorBoundary>
				}
			/>
			<Route path="*" element={<NotFound />} />
		</Routes>
	);
}
