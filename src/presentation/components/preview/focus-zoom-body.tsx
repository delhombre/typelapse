import type { ReactNode } from "react";
import { clipFadeStops } from "../../../application/layout/canvas-fit";
import {
	type ZoomTransform,
	pushInFade,
	zoomOriginX,
} from "../../../application/magic-move/focus-zoom";

/**
 * The code body under the chrome bar, pushed in by the focus zoom: the one
 * spelling both DOM renderers (the preview and the Remotion composition) use.
 *
 * Two boxes, because the clip must not scale (the rule in `focus-zoom`): the
 * outer one clips at the body's own box, the inner one scales. A single box
 * that both clipped and scaled grew its clip with the push-in, so the first rows
 * climbed over the chrome bar where the painter cuts them off under it.
 *
 * The clip carries the window's border radius (concentric law), so a scaled,
 * composited layer never squares the window's corners.
 *
 * Across, the push-in pivots only as far left of centre as keeps the gutter in
 * frame (`zoomOriginX`), and the right edge fades over what it carries off
 * (`pushInFade`), in the outer box, outside the scale: where the painter lays it
 * (`paintPushInFade`).
 */
export function FocusZoomBody({
	zoom,
	active,
	borderRadius,
	frame,
	children,
}: {
	zoom: ZoomTransform;
	/** The scene's focus-zoom setting; off, the body never scales. */
	active: boolean;
	borderRadius: number;
	/** The window the body sits in, in its own px: what the pivot and the right fade are drawn from. */
	frame: {
		padding: number;
		windowWidth: number;
		fontSize: number;
		background: string;
		/** The window already fades its right edge (`clipFades`): the push-in adds none. */
		fadesRight: boolean;
	};
	children: ReactNode;
}) {
	const edge = active
		? pushInFade({
				zoomScale: zoom.scale,
				windowWidth: frame.windowWidth,
				fontSize: frame.fontSize,
				windowCutsRight: frame.fadesRight,
			})
		: null;
	const originX = zoomOriginX({ padding: frame.padding, bodyWidth: frame.windowWidth });
	return (
		<div style={{ position: "relative", overflow: "hidden", borderRadius }}>
			<div
				style={
					active
						? {
								transform: `scale(${zoom.scale})`,
								transformOrigin: `${originX * 100}% ${zoom.originYRatio * 100}%`,
							}
						: undefined
				}
			>
				{children}
			</div>
			{edge && (
				<div
					aria-hidden="true"
					data-push-in-fade
					style={{
						position: "absolute",
						pointerEvents: "none",
						top: 0,
						right: 0,
						bottom: 0,
						width: edge.width,
						opacity: edge.opacity,
						background: `linear-gradient(to right, ${clipFadeStops(frame.background).join(", ")})`,
					}}
				/>
			)}
		</div>
	);
}
