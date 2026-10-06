/**
 * Per-step caption rendered just beneath the code frame. A shared presentational
 * component (like `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview. Timing
 * (which text, what opacity) is decided upstream by `captionAt`; this only paints.
 */
import {
	CAPTION_LINE_HEIGHT,
	CAPTION_MARGIN_TOP,
	CAPTION_MAX_LINES,
} from "../../../application/layout/frame-metrics";

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
				marginTop: CAPTION_MARGIN_TOP * scale,
				textAlign: "center",
				pointerEvents: "none",
				// The band is as tall as `frameNaturalSize` budgeted before fitting the
				// card into the canvas: two lines, whether the caption fills them or
				// not, so a caption fading in never moves the frame and a wrapped one
				// never renders taller than the layout reserved and spills off the
				// bottom (worst on the narrow 9:16 preset).
				height: CAPTION_LINE_HEIGHT * CAPTION_MAX_LINES * scale,
				overflow: "hidden",
			}}
		>
			<span
				style={{
					// A long caption wraps to the card's width instead of being cut flat at
					// its edge. Two lines at most: a third is ellipsised, since the layout
					// has no room for it. The domain bounds the length (80 characters).
					display: "-webkit-box",
					WebkitBoxOrient: "vertical",
					WebkitLineClamp: CAPTION_MAX_LINES,
					overflow: "hidden",
					textWrap: "balance",
					overflowWrap: "anywhere",
					fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
					fontSize: 13 * scale,
					lineHeight: `${CAPTION_LINE_HEIGHT * scale}px`,
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
