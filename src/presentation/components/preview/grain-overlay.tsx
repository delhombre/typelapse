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
export function GrainOverlay({
	opacity = GRAIN_OPACITY,
	scale = 1,
}: {
	opacity?: number;
	/**
	 * Display px per canvas px, for a surface drawn smaller than the canvas. The
	 * tile is sized by it rather than by a transformed wrapper: `soft-light` only
	 * blends inside its stacking context, and under a transform it paints as a
	 * flat veil instead of texture.
	 */
	scale?: number;
}) {
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
				backgroundSize: `${GRAIN_TILE_SIZE * scale}px ${GRAIN_TILE_SIZE * scale}px`,
				opacity,
				mixBlendMode: "soft-light",
			}}
		/>
	);
}
