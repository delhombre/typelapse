import { Component, type ErrorInfo, type ReactNode } from "react";

interface RouteErrorBoundaryState {
	readonly failed: boolean;
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
		return (
			<main
				role="alert"
				className="route-state flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center"
			>
				<h1 className="text-[15px] font-semibold text-ink">
					{this.props.heading ?? "Typelapse hit a problem"}
				</h1>
				<p className="max-w-[34ch] text-[13px] leading-5 text-ash">
					{this.props.message ??
						"Your work is saved on this device. Reload to pick up where you left off."}
				</p>
				<div className="mt-1 flex items-center gap-2">
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper"
					>
						Reload
					</button>
					{/* A full load rather than a router link: the tree that threw is
					    not one to navigate from. */}
					{this.props.offerStudio ? (
						<a href="/app" className="rounded-full px-4 py-2 text-[13px] font-medium text-ink">
							Open the studio
						</a>
					) : null}
				</div>
			</main>
		);
	}
}
