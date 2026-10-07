/**
 * Per-step caption rendered just beneath the code frame. A shared presentational
 * component (like `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview. Timing
 * (which text, what opacity) is decided upstream by `captionAt`; this only paints.
 *
 * It paints on a plate (`application/captions/caption-plate.ts`), not straight
 * onto the background: the background is a flowing mesh whose lightest region is
 * yellow, and a caption in any one colour is unreadable on some part of it.
 */
import {
	CAPTION_INK,
	CAPTION_PLATE_FILL,
	CAPTION_PLATE_PAD,
} from "../../../application/captions/caption-plate";
import {
	CAPTION_FONT_SIZE,
	CAPTION_LINE_HEIGHT,
	CAPTION_MARGIN_TOP,
} from "../../../application/layout/frame-metrics";

interface StepCaptionProps {
	text: string;
	/** 0..1 fade, driven by `captionAt`. */
	opacity: number;
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

export function StepCaption({ text, opacity, scale = 1, lines }: StepCaptionProps) {
	const pad = CAPTION_PLATE_PAD * scale;
	return (
		<div
			style={{
				marginTop: CAPTION_MARGIN_TOP * scale,
				display: "flex",
				justifyContent: "center",
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
					overflowWrap: "anywhere",
					textAlign: "center",
					// The plate reaches `pad` past the words on each side, and the margin
					// takes that back from the layout: the words wrap at the width they
					// always did, so the band estimate (`captionLines`) still holds. A
					// caption as wide as the card has its plate trimmed flush by the band.
					boxSizing: "border-box",
					maxWidth: `calc(100% + ${2 * pad}px)`,
					padding: `0 ${pad}px`,
					margin: `0 ${-pad}px`,
					borderRadius: (CAPTION_LINE_HEIGHT / 2) * scale,
					backgroundColor: CAPTION_PLATE_FILL,
					fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
					fontSize: CAPTION_FONT_SIZE * scale,
					lineHeight: `${CAPTION_LINE_HEIGHT * scale}px`,
					fontWeight: 500,
					letterSpacing: "-0.01em",
					color: CAPTION_INK,
					opacity,
				}}
			>
				{text}
			</span>
		</div>
	);
}
