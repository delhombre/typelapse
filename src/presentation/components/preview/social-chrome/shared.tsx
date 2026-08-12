/**
 * Shared building blocks for the platform chrome.
 *
 * Legibility over an arbitrary mesh is the whole game: every white icon carries
 * a soft `drop-shadow` and every white label a matching `text-shadow`, so the
 * furniture stays readable on light or dark backgrounds exactly the way the real
 * apps float white UI over video. Sizes are passed in as `em` (relative to the
 * overlay's `cqmin` root) so the entire mockup scales with the preview canvas.
 */

import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { MusicNote, PersonSilhouette, Plus } from "./icons";

/** System UI sans, the family every one of these feeds actually renders in. */
export const SANS =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const WHITE = "#ffffff";
export const DIM_WHITE = "rgba(255,255,255,0.62)";

/** Soft shadow keeping white icons legible on any mesh. */
export const ICON_SHADOW = "drop-shadow(0 0.05em 0.14em rgba(0,0,0,0.5))";
/** Matching text-shadow for white labels. */
export const TEXT_SHADOW = "0 0.06em 0.18em rgba(0,0,0,0.6)";

interface FeedTextOptions {
	size: string;
	weight?: number;
	color?: string;
	dim?: boolean;
	shadow?: boolean;
}

/** Text style for white feed labels: bold-ish, shadowed, tight leading. */
export function feedText({
	size,
	weight = 600,
	color,
	dim,
	shadow = true,
}: FeedTextOptions): CSSProperties {
	return {
		fontSize: size,
		fontWeight: weight,
		color: color ?? (dim ? DIM_WHITE : WHITE),
		textShadow: shadow ? TEXT_SHADOW : undefined,
		lineHeight: 1.25,
		whiteSpace: "nowrap",
	};
}

/** Size + color a glyph and (optionally) drop its legibility shadow. */
export function GlyphBox({
	size,
	color = WHITE,
	shadow = true,
	children,
}: {
	size: string;
	color?: string;
	shadow?: boolean;
	children: ReactNode;
}) {
	return (
		<span
			style={{
				display: "inline-flex",
				width: size,
				height: size,
				flexShrink: 0,
				color,
				filter: shadow ? ICON_SHADOW : undefined,
			}}
		>
			{children}
		</span>
	);
}

/** A faint feed gradient hugging one edge, so white furniture never washes out. */
export function EdgeScrim({
	edge,
	size,
	alpha,
}: { edge: "top" | "bottom"; size: string; alpha: number }) {
	const dir = edge === "top" ? "to bottom" : "to top";
	const style: CSSProperties = {
		position: "absolute",
		left: 0,
		right: 0,
		height: size,
		background: `linear-gradient(${dir}, rgba(0,0,0,${alpha}), rgba(0,0,0,0))`,
	};
	style[edge] = 0;
	return <div style={style} />;
}

/** The vertical right-hand action rail, anchored to the right/bottom insets. */
export function Rail({
	right,
	bottom,
	gap,
	children,
}: {
	right: string;
	bottom: string;
	gap: string;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				position: "absolute",
				right,
				bottom,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap,
			}}
		>
			{children}
		</div>
	);
}

/** One rail entry: a glyph stacked over its (bold, small) count label. */
export function RailButton({
	icon,
	label,
	labelColor,
	labelSize,
	gap = "0.42em",
}: {
	icon: ReactNode;
	label?: string;
	labelColor?: string;
	labelSize: string;
	gap?: string;
}) {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
			{icon}
			{label ? (
				<span style={feedText({ size: labelSize, weight: 700, color: labelColor })}>{label}</span>
			) : null}
		</div>
	);
}

/** Placeholder profile picture: a soft gradient disc with a person silhouette. */
export function Avatar({
	size,
	ringColor = WHITE,
	ringWidth = "0.12em",
	badge,
}: {
	size: string;
	ringColor?: string;
	ringWidth?: string;
	badge?: ReactNode;
}) {
	return (
		<div
			style={{
				position: "relative",
				width: size,
				height: size,
				flexShrink: 0,
				filter: ICON_SHADOW,
			}}
		>
			<div
				style={{
					width: "100%",
					height: "100%",
					borderRadius: "999px",
					border: `${ringWidth} solid ${ringColor}`,
					background: "linear-gradient(150deg, #9aa0aa 0%, #c9cdd4 55%, #e6e8ec 100%)",
					overflow: "hidden",
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "center",
				}}
			>
				<span
					style={{ width: "78%", height: "88%", display: "inline-flex", alignItems: "flex-end" }}
				>
					<PersonSilhouette />
				</span>
			</div>
			{badge ? (
				<div
					style={{
						position: "absolute",
						left: "50%",
						bottom: "-0.42em",
						transform: "translateX(-50%)",
					}}
				>
					{badge}
				</div>
			) : null}
		</div>
	);
}

/** The circular "+" that overlaps a TikTok avatar's lower edge. */
export function PlusBadge({ color, size = "1.55em" }: { color: string; size?: string }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "999px",
				background: color,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				color: WHITE,
			}}
		>
			<span style={{ width: "58%", height: "58%", display: "inline-flex" }}>
				<Plus />
			</span>
		</div>
	);
}

/** A follow / subscribe pill; filled or outline per the platform. */
export function Pill({
	label,
	size,
	color = WHITE,
	background = "transparent",
	border,
	radius = "0.5em",
}: {
	label: string;
	size: string;
	color?: string;
	background?: string;
	border?: string;
	/** Reels uses a rounded rect; X and LinkedIn are fully rounded (`999px`). */
	radius?: string;
}) {
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				background,
				color,
				border,
				borderRadius: radius,
				padding: "0.4em 0.85em",
				fontSize: size,
				fontWeight: 700,
				lineHeight: 1,
				whiteSpace: "nowrap",
			}}
		>
			{label}
		</span>
	);
}

/** Shared face of the audio disc: dark vinyl with a bright center label + note. */
function discFace(size: string): ReactNode {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "999px",
				background: "radial-gradient(circle at 50% 50%, #2c2c2e 0 30%, #0c0c0d 31% 100%)",
				border: "0.12em solid rgba(255,255,255,0.22)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				filter: ICON_SHADOW,
			}}
		>
			<div
				style={{
					width: "40%",
					height: "40%",
					borderRadius: "999px",
					background: "linear-gradient(150deg, #f06, #90f)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<span style={{ width: "55%", height: "55%", display: "inline-flex", color: WHITE }}>
					<MusicNote />
				</span>
			</div>
		</div>
	);
}

/** A spinning audio disc (TikTok / Shorts). Static under reduced motion. */
export function SpinningDisc({ size }: { size: string }) {
	const reduce = useReducedMotion();
	if (reduce) {
		return <>{discFace(size)}</>;
	}
	return (
		<motion.div
			style={{ width: size, height: size }}
			animate={{ rotate: 360 }}
			transition={{ repeat: Number.POSITIVE_INFINITY, ease: "linear", duration: 6 }}
		>
			{discFace(size)}
		</motion.div>
	);
}

/** Reels audio cover: a small rounded thumbnail (never spins). */
export function AudioThumb({ size }: { size: string }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "0.35em",
				background: "linear-gradient(150deg, #f06, #90f)",
				border: "0.12em solid rgba(255,255,255,0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				filter: ICON_SHADOW,
			}}
		>
			<span style={{ width: "55%", height: "55%", display: "inline-flex", color: WHITE }}>
				<MusicNote />
			</span>
		</div>
	);
}

/** TikTok's top-left LIVE entry: a rounded-square outline with LIVE inside. */
export function LiveSquare({ size }: { size: string }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "0.32em",
				border: "0.12em solid rgba(255,255,255,0.92)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				filter: ICON_SHADOW,
			}}
		>
			<span
				style={{
					fontSize: "0.5em",
					fontWeight: 800,
					letterSpacing: "0.02em",
					color: WHITE,
				}}
			>
				LIVE
			</span>
		</div>
	);
}

/** A short row of overlapping mini avatars — Instagram's "Liked by" proof row
    and the cluster beside the Reels/Friends tabs. */
export function AvatarStack({ size, count = 3 }: { size: string; count?: number }) {
	const tints = ["#f0a", "#5ac8fa", "#ffd60a", "#30d158", "#bf5af2"];
	return (
		<div style={{ display: "inline-flex", filter: ICON_SHADOW }}>
			{Array.from({ length: count }, (_, i) => (
				<div
					key={tints[i] ?? i}
					style={{
						width: size,
						height: size,
						borderRadius: "999px",
						background: tints[i] ?? "#8e8e93",
						border: "0.1em solid rgba(255,255,255,0.95)",
						marginLeft: i === 0 ? 0 : `calc(${size} * -0.42)`,
						overflow: "hidden",
						display: "flex",
						alignItems: "flex-end",
						justifyContent: "center",
					}}
				>
					<span style={{ width: "80%", height: "90%", display: "inline-flex" }}>
						<PersonSilhouette />
					</span>
				</div>
			))}
		</div>
	);
}
