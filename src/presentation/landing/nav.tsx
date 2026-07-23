import { DynamicNav } from "./dynamic-nav";

/**
 * Landing nav. A scroll-reactive Dynamic Island: a full-bleed frosted bar at the
 * top that retracts into a compact, centered, floating near-black pill on scroll,
 * and unfolds again at the top. The morph itself lives in `DynamicNav`.
 */
export function Nav() {
	return <DynamicNav />;
}
