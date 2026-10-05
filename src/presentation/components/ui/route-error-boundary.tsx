import { Component, type ComponentType, type ErrorInfo, type ReactNode, useState } from "react";

interface RouteErrorBoundaryState {
	readonly failed: boolean;
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

/** What a route may put its fallback in. */
export type FallbackShell = ComponentType<{ readonly children: ReactNode }>;

/**
 * What the fallback sits in unless the route says otherwise. The studio's dark
 * theme is a `.dark` class on the root, which `.route-state` reads. It is read
 * as the fallback renders, which is before the failed page's cleanups run, so a
 * page that takes its theme down as it unmounts still hands it over.
 */
function DarkShell({ children }: { readonly children: ReactNode }) {
	const [dark] = useState(
		() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
	);
	return <div className={dark ? "dark" : undefined}>{children}</div>;
}

interface RouteErrorBoundaryProps {
	readonly children: ReactNode;
	/** What the fallback says. The default is the studio's, which has saved work to point at. */
	readonly heading?: string;
	readonly message?: string;
	/** Offer the studio beside Reload: a page that is not the studio can still send people there. */
	readonly offerStudio?: boolean;
	/**
	 * The route's own shell for the fallback, for a page that puts more on the
	 * document than the studio's `.dark` (the landing's overscroll paint and
	 * status bar colour). It reads what it needs as it renders, before the failed
	 * page's cleanups, and keeps it for as long as the fallback is on screen.
	 */
	readonly Shell?: FallbackShell;
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
	override state: RouteErrorBoundaryState = { failed: false };

	static getDerivedStateFromError(): RouteErrorBoundaryState {
		return { failed: true };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("Typelapse could not render this page", error, info.componentStack);
	}

	override render(): ReactNode {
		if (!this.state.failed) {
			return this.props.children;
		}
		const Shell = this.props.Shell ?? DarkShell;
		return (
			<Shell>
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
			</Shell>
		);
	}
}
