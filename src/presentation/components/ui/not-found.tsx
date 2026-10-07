import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ROUTE_STATE } from "./route-error-boundary";

/**
 * Any address the app does not have. Without it the router matched nothing and
 * #root stayed empty: a stale link or a typo opened a blank page with no way on.
 * Same material as the route error boundary, so the two read as one family.
 */
export function NotFound() {
	useEffect(() => {
		const previous = document.title;
		document.title = "Page not found · Typelapse";
		// The host owns the status; the page owns saying it is not for the index.
		const robots = document.createElement("meta");
		robots.name = "robots";
		robots.content = "noindex";
		document.head.append(robots);
		return () => {
			document.title = previous;
			robots.remove();
		};
	}, []);

	return (
		<main className={ROUTE_STATE.main}>
			<h1 className={ROUTE_STATE.heading}>This page does not exist</h1>
			<p className={ROUTE_STATE.body}>The link may be old or mistyped.</p>
			<div className={ROUTE_STATE.actions}>
				<Link to="/app" className={ROUTE_STATE.primary}>
					Open the studio
				</Link>
				<Link to="/" className={ROUTE_STATE.secondary}>
					Back to Typelapse
				</Link>
			</div>
		</main>
	);
}
