/**
 * Per-step caption rendered just beneath the code frame. A shared presentational
 * component (like `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview. Timing
 * (which text, what opacity) is decided upstream by `captionAt`; this only paints.
 */
import {
	CAPTION_FONT_SIZE,
	CAPTION_LINE_HEIGHT,
	CAPTION_MARGIN_TOP,
} from "../../../application/layout/frame-metrics";

interface StepCaptionProps {
	text: string;
	/** 0..1 fade, driven by `captionAt`. */
	opacity: number;
	/** Contrast color for the current background (see `getWatermarkColor`). */
	color: string;
	/** Upscale factor for the video (1 in the browser). */
	scale?: number;
	/**
	 * The lines the layout reserved for the caption band (`captionBandLines`, 1 or
	 * 2): the one number the preview, the video and the painter's band share. The
	 * band is exactly this tall and the text is cut at this many lines, an
	 * ellipsis on the last, so it can never outgrow what the card was fitted around.
	 */
	lines: number;
}

export function StepCaption({ text, opacity, color, scale = 1, lines }: StepCaptionProps) {
	return (
		<div
			style={{
				marginTop: CAPTION_MARGIN_TOP * scale,
				textAlign: "center",
				pointerEvents: "none",
				// Reserved whether the caption fills it or not, so a caption fading in
				// never moves the frame.
				height: CAPTION_LINE_HEIGHT * lines * scale,
				overflow: "hidden",
			}}
		>
			<span
				style={{
					// A long caption wraps to the card's width instead of being cut flat
					// at its edge, and is ellipsised past the reserved lines.
					display: "-webkit-box",
					WebkitBoxOrient: "vertical",
					WebkitLineClamp: lines,
					overflow: "hidden",
					textWrap: "balance",
					overflowWrap: "anywhere",
					fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
					fontSize: CAPTION_FONT_SIZE * scale,
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
