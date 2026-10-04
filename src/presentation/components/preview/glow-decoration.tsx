import { memo } from "react";

/**
 * The soft centre glow both exporters lay over the background, under the card.
 *
 * Sized in canvas pixels times `scale`: the composition draws it on the export
 * canvas at 1, the preview in its aspect box at the box's share of the canvas, so
 * the two are the same picture at two sizes. The painter's `paintGlow`
 * approximates it.
 */
function GlowDecorationView({ scale = 1 }: { scale?: number }) {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					width: "70%",
					height: "60%",
					borderRadius: 28 * scale,
					background: "radial-gradient(closest-side, rgba(255,255,255,0.05), transparent)",
					filter: `blur(${48 * scale}px)`,
				}}
			/>
		</div>
	);
}

// Memoized: its props hold still while the preview repaints on every playback tick.
export const GlowDecoration = memo(GlowDecorationView);
