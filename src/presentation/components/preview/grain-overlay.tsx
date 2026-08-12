// Relative, like every other component the Remotion composition pulls in: that
// bundle resolves no path alias.
import {
	GRAIN_OPACITY,
	GRAIN_TILE_SIZE,
	GRAIN_TILE_URL,
} from "../../../application/backgrounds/grain";

/**
 * A subtle film-grain layer over a gradient background. A large flat gradient
 * bands and reads as plastic; grain breaks the bands up and is what separates a
 * background that looks rendered from one that looks made. Rendered identically
 * in the browser preview and in Remotion's headless Chrome so the exported
 * video matches.
 */
export function GrainOverlay({ opacity = GRAIN_OPACITY }: { opacity?: number }) {
	return (
		<div
			aria-hidden="true"
			style={{
				position: "absolute",
				inset: 0,
				// Match the parent's rounding so the square noise tile never pokes
				// past a rounded card's corners.
				borderRadius: "inherit",
				pointerEvents: "none",
				backgroundImage: `url("${GRAIN_TILE_URL}")`,
				backgroundSize: `${GRAIN_TILE_SIZE}px ${GRAIN_TILE_SIZE}px`,
				opacity,
				mixBlendMode: "soft-light",
			}}
		/>
	);
}
