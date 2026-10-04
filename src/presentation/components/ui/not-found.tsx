import { useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * Any address the app does not have. Without it the router matched nothing and
 * #root stayed empty: a stale link or a typo opened a blank page with no way on.
 * Same material as the route error boundary, so the two read as one family.
 */
export function NotFound() {
	useEffect(() => {
		const previous = document.title;
		document.title = "Page not found · Typelapse";
		return () => {
			document.title = previous;
		};
	}, []);

	return (
		<main className="route-state flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
			<h1 className="text-[15px] font-semibold text-ink">This page does not exist</h1>
			<p className="max-w-[34ch] text-[13px] leading-5 text-ash">
				The link may be old or mistyped.
			</p>
			<div className="mt-1 flex items-center gap-2">
				<Link
					to="/app"
					className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper"
				>
					Open the studio
				</Link>
				<Link to="/" className="rounded-full px-4 py-2 text-[13px] font-medium text-ink">
					Back to Typelapse
				</Link>
			</div>
		</main>
	);
}
