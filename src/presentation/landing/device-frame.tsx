// Throwaway: landing-only change (#302).
import type { CSSProperties, ReactNode } from "react";

/**
 * A photoreal iPhone shell, presentation only.
 *
 * The chassis is an image laid *over* live DOM, not CSS drawing a phone. No
 * stack of gradients reproduces titanium, the curvature of the corners or the
 * way the bezel catches light, and the previous hand-drawn version was hitting
 * exactly that ceiling.
 *
 * Two consequences worth knowing before editing:
 *
 * 1. The screen content sits *underneath* the chassis, so the Dynamic Island
 *    (part of the image) floats above the content the way it does on a real
 *    device, and the metal edge hides any imperfection in the content's own
 *    corner clipping.
 * 2. Every measurement below is a percentage taken from the asset itself, so
 *    the frame stays exact at any width. `cqw` units resolve against this
 *    component's own width, which is what `container-type: inline-size` is for.
 */

/** The master's size, which the 320/640 renditions in public/illustrations scale; the
    container keeps its ratio so nothing distorts. */
const FRAME_RATIO = "1350 / 2760";

/**
 * The transparent screen window, measured from the asset's alpha channel.
 * Screen box: x=72 y=72 w=1206 h=2617 of a 1350x2760 image.
 */
const SCREEN = {
	left: "5.33%",
	top: "2.61%",
	width: "89.33%",
	height: "94.82%",
} as const;

/** Screen corner radius as a fraction of the component's width (~120/1350). */
const SCREEN_RADIUS = "8.9cqw";

/** Contact shadow. The chassis image carries its own highlights, so this only
    grounds the device on the page rather than trying to model the metal. */
const DEVICE_SHADOW = [
	"drop-shadow(0 2px 4px rgb(0 0 0 / 0.28))",
	"drop-shadow(0 24px 40px rgb(0 0 0 / 0.34))",
].join(" ");

interface DeviceFrameProps {
	children: ReactNode;
	/** Accessible label for the whole device (the screen content stays hidden). */
	ariaLabel: string;
	className?: string;
	style?: CSSProperties;
}

export function DeviceFrame({ children, ariaLabel, className = "", style }: DeviceFrameProps) {
	return (
		<div
			role="img"
			aria-label={ariaLabel}
			className={`relative w-full ${className}`}
			style={{
				maxWidth: 320,
				aspectRatio: FRAME_RATIO,
				containerType: "inline-size",
				...style,
			}}
		>
			{/* The screen well: live content, clipped to the screen window. */}
			<div
				aria-hidden
				className="absolute overflow-hidden"
				style={{
					left: SCREEN.left,
					top: SCREEN.top,
					width: SCREEN.width,
					height: SCREEN.height,
					borderRadius: SCREEN_RADIUS,
					background: "#000",
				}}
			>
				{children}
			</div>

			{/* The chassis, over the content. Its own transparency is the screen
			    cut-out, and the Dynamic Island rides on top of the feed. */}
			<img
				src="/illustrations/iphone-frame-320.webp"
				srcSet="/illustrations/iphone-frame-320.webp 320w, /illustrations/iphone-frame-640.webp 640w"
				sizes="min(320px, 100vw)"
				width={320}
				height={654}
				// Far below the fold: it loads as the section nears, and the box's own
				// aspect-ratio holds its place until then.
				loading="lazy"
				decoding="async"
				alt=""
				aria-hidden
				draggable={false}
				// drop-shadow rather than box-shadow: it follows the cut-out silhouette
				// of the device instead of boxing it in a rectangle.
				className="pointer-events-none absolute inset-0 h-full w-full select-none"
				style={{ zIndex: 10, filter: DEVICE_SHADOW }}
			/>
		</div>
	);
}
