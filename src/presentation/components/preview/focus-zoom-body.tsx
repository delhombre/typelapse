import type { ZoomTransform } from "@/application/magic-move/focus-zoom";
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
 */
export function FocusZoomBody({
	zoom,
	active,
	borderRadius,
	children,
}: {
	zoom: ZoomTransform;
	/** The scene's focus-zoom setting; off, the body never scales. */
	active: boolean;
	borderRadius: number;
	children: ReactNode;
}) {
	return (
		<div style={{ overflow: "hidden", borderRadius }}>
			<div
				style={
					active
						? {
								transform: `scale(${zoom.scale})`,
								transformOrigin: `50% ${zoom.originYRatio * 100}%`,
							}
						: undefined
				}
			>
				{children}
			</div>
		</div>
	);
}
