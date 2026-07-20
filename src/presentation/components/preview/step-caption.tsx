/**
 * Per-step caption rendered just beneath the code frame. A shared presentational
 * component (like `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview. Timing
 * (which text, what opacity) is decided upstream by `captionAt`; this only paints.
 */

interface StepCaptionProps {
	text: string;
	/** 0..1 fade, driven by `captionAt`. */
	opacity: number;
	/** Contrast color for the current background (see `getWatermarkColor`). */
	color: string;
	/** Upscale factor for the video (1 in the browser). */
	scale?: number;
}

export function StepCaption({ text, opacity, color, scale = 1 }: StepCaptionProps) {
	return (
		<div
			style={{
				marginTop: 14 * scale,
				textAlign: "center",
				pointerEvents: "none",
				// Reserve a line so the frame doesn't jump when a caption fades in/out.
				minHeight: 20 * scale,
			}}
		>
			<span
				style={{
					fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
					fontSize: 13 * scale,
					fontWeight: 500,
					letterSpacing: "-0.01em",
					color,
					opacity,
				}}
			>
				{text}
			</span>
		</div>
	);
}
