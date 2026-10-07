import { clipFadeStops } from "@/application/layout/canvas-fit";
import type { LineClip } from "@/application/layout/line-clip";
import { type ZoomTransform, pushInFade, zoomOriginX } from "@/application/magic-move/focus-zoom";
import type { ReactNode } from "react";

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
	/**
	 * The window the body sits in, in its own px: what the pivot and the right
	 * fade are drawn from. Absent, the push-in is centred and draws no fade.
	 */
	frame?: {
		padding: number;
		windowWidth: number;
		fontSize: number;
		background: string;
		lineClip: LineClip | null;
	};
	children: ReactNode;
}) {
	const edge =
		active && frame
			? pushInFade({
					zoomScale: zoom.scale,
					windowWidth: frame.windowWidth,
					fontSize: frame.fontSize,
					windowCutsRight: frame.lineClip !== null,
				})
			: null;
	const originX = frame
		? zoomOriginX({ padding: frame.padding, bodyWidth: frame.windowWidth })
		: 0.5;
	const [clear, solid] = clipFadeStops(frame?.background ?? "");
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
						background: `linear-gradient(to right, ${clear}, ${solid})`,
					}}
				/>
			)}
		</div>
	);
}
