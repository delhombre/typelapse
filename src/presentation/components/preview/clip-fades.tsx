import { type ClipFade, clipFadeStops } from "../../../application/layout/canvas-fit";

/**
 * The fades over the edges a window clips at the readable floor, as the painter
 * lays them (`paintClipFades`): anchored to the window's right and bottom
 * edges, a gradient from the window's own background to opaque at the cut.
 * `unit` turns the fades' card-space px into this window's px (1 in the
 * composition, the render scale in the editor-size preview).
 */
export function ClipFades({
	fades,
	background,
	unit = 1,
}: {
	fades: ClipFade[];
	background: string;
	unit?: number;
}) {
	const [clear, solid] = clipFadeStops(background);
	return fades.map((fade) => (
		<div
			key={fade.edge}
			aria-hidden="true"
			data-clip-fade={fade.edge}
			style={{
				position: "absolute",
				pointerEvents: "none",
				zIndex: 1,
				right: 0,
				bottom: 0,
				...(fade.edge === "right"
					? {
							top: fade.y / unit,
							width: fade.width / unit,
							background: `linear-gradient(to right, ${clear}, ${solid})`,
						}
					: {
							left: 0,
							height: fade.height / unit,
							background: `linear-gradient(to bottom, ${clear}, ${solid})`,
						}),
			}}
		/>
	));
}
