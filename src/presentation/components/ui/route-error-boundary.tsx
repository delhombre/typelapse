import { LandingChrome } from "@/presentation/landing/use-landing-theme";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface RouteErrorBoundaryState {
	readonly failed: boolean;
	/** The theme the page was in when it threw, read once (see `themeAtFailure`). */
	readonly dark: boolean;
	/** Whether that page was the landing, whose document chrome the fallback keeps. */
	readonly landing: boolean;
}

/**
 * The 404 and this fallback are one family in the landing's material: one
 * filled action in the brand's primary with its own glow (the landing's
 * InkButton without the motion library), the other a quiet text action, both
 * 44px tall for a thumb. `.route-state` remaps paper, ink and ash under `.dark`.
 */
export const ROUTE_STATE = {
	main: "route-state flex min-h-dvh flex-col items-center justify-center bg-paper px-6 py-16 text-center",
	heading:
		"text-balance text-[22px] leading-tight font-semibold tracking-[-0.012em] text-ink sm:text-2xl",
	body: "mt-2 max-w-[38ch] text-pretty text-[15px] leading-6 text-ash",
	actions: "mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-3",
	primary:
		"inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-[15px] font-medium text-on-primary shadow-[0_6px_20px_-6px_var(--color-primary-glow)] transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-primary-hover hover:shadow-[0_11px_28px_-7px_var(--color-primary-glow)] active:scale-[0.97] motion-reduce:active:scale-100",
	secondary:
		"inline-flex h-11 items-center justify-center rounded-full px-4 text-[15px] font-medium text-ash transition-[color,scale] duration-150 ease-out hover:text-ink active:scale-[0.97] motion-reduce:active:scale-100",
} as const;

/**
 * The studio's dark theme is a `.dark` class on the root, which `.route-state`
 * reads. The landing's is a `data-landing-theme` attribute instead, and the
 * landing removes it as it unmounts, so the fallback that replaces it opened on
 * light paper for a dark-theme visitor. Read both at the moment of the throw,
 * before that cleanup runs. While the attribute is there it is the whole
 * answer, as it is for the CSS: a `.dark` left on the root by a studio visit
 * does not make a light landing dark.
 */
function themeAtFailure(): Pick<RouteErrorBoundaryState, "dark" | "landing"> {
	if (typeof document === "undefined") return { dark: false, landing: false };
	const root = document.documentElement;
	const landing = root.dataset.landingTheme;
	if (landing === "light" || landing === "dark") {
		return { dark: landing === "dark", landing: true };
	}
	return { dark: root.classList.contains("dark"), landing: false };
}

interface RouteErrorBoundaryProps {
	readonly children: ReactNode;
	/** What the fallback says. The default is the studio's, which has saved work to point at. */
	readonly heading?: string;
	readonly message?: string;
	/** Offer the studio beside Reload: a page that is not the studio can still send people there. */
	readonly offerStudio?: boolean;
}

/**
 * The last line under a route: a render error or a route chunk that fails to
 * load (a redeploy while the tab was open, a dropped connection) used to empty
 * #root and leave a blank page. Work is autosaved on this device as it is
 * made, so reloading is a real recovery, and the fallback says exactly that.
 */
export class RouteErrorBoundary extends Component<
	RouteErrorBoundaryProps,
	RouteErrorBoundaryState
> {
	override state: RouteErrorBoundaryState = { failed: false, dark: false, landing: false };

	static getDerivedStateFromError(): RouteErrorBoundaryState {
		return { failed: true, ...themeAtFailure() };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("Typelapse could not render this page", error, info.componentStack);
	}

	override render(): ReactNode {
		if (!this.state.failed) {
			return this.props.children;
		}
		return (
			<div className={this.state.dark ? "dark" : undefined}>
				{/* The overscroll and the status bar are the landing route's, and the page's
				    own effects took them down as the failure unmounted it. This mounts
				    after those cleanups (React runs every cleanup of a commit before any
				    new effect), so the document keeps the theme the page had and lets go
				    of it when the route is left. */}
				{this.state.landing ? <LandingChrome theme={this.state.dark ? "dark" : "light"} /> : null}
				<main role="alert" className={ROUTE_STATE.main}>
					<h1 className={ROUTE_STATE.heading}>{this.props.heading ?? "Typelapse hit a problem"}</h1>
					<p className={ROUTE_STATE.body}>
						{this.props.message ??
							"Your work is saved on this device. Reload to pick up where you left off."}
					</p>
					<div className={ROUTE_STATE.actions}>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className={ROUTE_STATE.primary}
						>
							Reload
						</button>
						{/* A full load rather than a router link: the tree that threw is
						    not one to navigate from. */}
						{this.props.offerStudio ? (
							<a href="/app" className={ROUTE_STATE.secondary}>
								Open the studio
							</a>
						) : null}
					</div>
				</main>
			</div>
		);
	}
}
