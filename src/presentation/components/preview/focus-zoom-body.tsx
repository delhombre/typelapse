import type { LineClip } from "@/application/layout/line-clip";
import { type ZoomTransform, zoomOriginX } from "@/application/magic-move/focus-zoom";
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
 * Across, the push-in pivots on the body's centre, or on its left edge when the
 * code column cuts a long line (`zoomOriginX`), as the painter's does.
 */
export function FocusZoomBody({
	zoom,
	active,
	borderRadius,
	lineClip = null,
	children,
}: {
	zoom: ZoomTransform;
	/** The scene's focus-zoom setting; off, the body never scales. */
	active: boolean;
	borderRadius: number;
	/** The code column's cut, from the fit; null (the default) when every line fits. */
	lineClip?: LineClip | null;
	children: ReactNode;
}) {
	return (
		<div style={{ overflow: "hidden", borderRadius }}>
			<div
				style={
					active
						? {
								transform: `scale(${zoom.scale})`,
								transformOrigin: `${zoomOriginX(lineClip) * 100}% ${zoom.originYRatio * 100}%`,
							}
						: undefined
				}
			>
				{children}
			</div>
		</div>
	);
}
