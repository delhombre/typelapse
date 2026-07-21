/**
 * Hand-crafted feed glyphs, each drawn to match the real app's action rail.
 *
 * Every glyph is a 24x24 svg that fills its box and paints in `currentColor`
 * (solid icons use `fill`, outline icons use `stroke`), so the parent decides
 * size, color and drop-shadow via a single wrapper. Kept deliberately close to
 * each platform's real icon: solid heart/comment/bookmark for TikTok, outline
 * heart + paper-plane for Reels, thumbs for Shorts, repost + view-bars for X.
 *
 * Brand wordmarks (TikTok / Instagram / YouTube / X) come from `simple-icons`
 * (CC0); LinkedIn was pulled from that set for trademark reasons, so its mark is
 * recreated here. See ./index.tsx for the licensing note.
 */

import type { SVGProps } from "react";

interface GlyphProps {
	/** Stroke weight for outline glyphs (ignored by solid ones). */
	stroke?: number;
}

/** Every glyph is decorative: a single `aria-hidden` 24x24 canvas that fills its box. */
function Svg(props: SVGProps<SVGSVGElement>) {
	return <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" {...props} />;
}

/* ─────────── solid glyphs (TikTok, likes) ─────────── */

export function HeartSolid() {
	return (
		<Svg fill="currentColor">
			<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
		</Svg>
	);
}

export function CommentSolid() {
	return (
		<Svg fill="currentColor">
			<path d="M12 3C6.5 3 2 6.58 2 11c0 2.5 1.42 4.73 3.64 6.2-.13 1.03-.6 2.36-1.55 3.32-.24.25-.07.68.28.66 1.94-.1 3.78-.85 5.05-1.72.82.18 1.68.28 2.58.28 5.5 0 10-3.58 10-8s-4.5-8-10-8z" />
		</Svg>
	);
}

export function BookmarkSolid() {
	return (
		<Svg fill="currentColor">
			<path d="M6 3h12a1 1 0 0 1 1 1v17.05a.6.6 0 0 1-.93.5L12 18.6l-6.07 2.95A.6.6 0 0 1 5 21.05V4a1 1 0 0 1 1-1z" />
		</Svg>
	);
}

/** TikTok share: a curved forward arrow. */
export function ForwardArrow() {
	return (
		<Svg fill="currentColor">
			<path d="M13.5 4.2a.7.7 0 0 1 1.18-.5l6.9 6.55a1 1 0 0 1 0 1.45l-6.9 6.56a.7.7 0 0 1-1.18-.5v-3.14c-4.8.06-8.06 1.36-10.6 4.35-.35.4-1 .12-.94-.42.62-6.02 4.13-9.7 11.54-10.2V4.2z" />
		</Svg>
	);
}

/* ─────────── outline glyphs (Reels, Shorts, X) ─────────── */

export function HeartOutline({ stroke = 1.8 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round">
			<path d="M12 20.7l-1.32-1.2C5.9 15.15 3 12.4 3 9.1 3 6.42 5.1 4.3 7.75 4.3c1.5 0 2.94.7 3.88 1.8l.37.44.37-.44a5.1 5.1 0 0 1 3.88-1.8C22.9 4.3 21 6.42 21 9.1c0 3.3-2.9 6.05-7.68 10.4L12 20.7z" />
		</Svg>
	);
}

export function CommentOutline({ stroke = 1.8 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round">
			<path d="M12 3.5C6.75 3.5 2.75 6.9 2.75 11c0 2.35 1.32 4.45 3.4 5.86-.13 1-.56 2.16-1.36 3.05a.4.4 0 0 0 .32.67c1.72-.06 3.4-.66 4.63-1.45.7.15 1.45.22 2.26.22 5.25 0 9.25-3.4 9.25-7.5S17.25 3.5 12 3.5z" />
		</Svg>
	);
}

/** Instagram / LinkedIn direct-share: outline paper plane. */
export function PaperPlane({ stroke = 1.8 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round">
			<path d="M21.5 3.2 2.9 10.4c-.7.27-.66 1.28.06 1.5l6.06 1.86 2.02 5.9c.24.7 1.2.78 1.55.13l2.36-4.3 4.7 3.4c.5.36 1.2.06 1.3-.53L22.5 4a.7.7 0 0 0-1-.8z" />
			<path d="M9.02 13.76 21.5 3.2" />
		</Svg>
	);
}

export function DotsVertical() {
	return (
		<Svg fill="currentColor">
			<circle cx="12" cy="5" r="1.7" />
			<circle cx="12" cy="12" r="1.7" />
			<circle cx="12" cy="19" r="1.7" />
		</Svg>
	);
}

export function ThumbUp({ stroke = 1.7 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round">
			<path d="M7 10.5 11 2.6a.5.5 0 0 1 .55-.28C12.9 2.6 14 3.8 14 5.3v3.2h4.9a2 2 0 0 1 1.98 2.3l-1.1 7a2 2 0 0 1-1.98 1.7H7" />
			<path d="M7 10.5H4.4a1.4 1.4 0 0 0-1.4 1.4v6.2A1.4 1.4 0 0 0 4.4 19.5H7z" />
		</Svg>
	);
}

export function ThumbDown({ stroke = 1.7 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round">
			<path d="M17 13.5 13 21.4a.5.5 0 0 1-.55.28C11.1 21.4 10 20.2 10 18.7v-3.2H5.1a2 2 0 0 1-1.98-2.3l1.1-7A2 2 0 0 1 6.2 4.5H17" />
			<path d="M17 13.5h2.6a1.4 1.4 0 0 0 1.4-1.4V5.9A1.4 1.4 0 0 0 19.6 4.5H17z" />
		</Svg>
	);
}

/** X repost / LinkedIn repost: two chasing arrows. */
export function Repost({ stroke = 1.8 }: GlyphProps) {
	return (
		<Svg
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M17 2.5 20.5 6 17 9.5" />
			<path d="M3.5 11V9a3 3 0 0 1 3-3h14" />
			<path d="M7 21.5 3.5 18 7 14.5" />
			<path d="M20.5 13v2a3 3 0 0 1-3 3h-14" />
		</Svg>
	);
}

/** X views: an ascending bar chart. */
export function ViewBars({ stroke = 2.2 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
			<path d="M4 20.5V13" />
			<path d="M9.3 20.5V8" />
			<path d="M14.7 20.5V11" />
			<path d="M20 20.5V4" />
		</Svg>
	);
}

/** X share / iOS share: tray with an up arrow. */
export function ShareUp({ stroke = 1.8 }: GlyphProps) {
	return (
		<Svg
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M12 3v12.5" />
			<path d="M7.8 7 12 2.8 16.2 7" />
			<path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7" />
		</Svg>
	);
}

/** YouTube Shorts remix: an eighth note ringed by a reuse arrow. */
export function Remix({ stroke = 1.7 }: GlyphProps) {
	return (
		<Svg
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M9 17V7.2l7-1.6V14" fill="none" />
			<circle cx="6.6" cy="17" r="2.3" fill="currentColor" stroke="none" />
			<circle cx="13.6" cy="14" r="2.3" fill="currentColor" stroke="none" />
			<path d="M18 4.2a4.6 4.6 0 0 1 2.8 4.2" />
			<path d="m17.4 6.6.6-2.4 2.4.6" />
		</Svg>
	);
}

/* ─────────── small chrome glyphs ─────────── */

/** Solid single eighth note for the audio row / disc center. */
export function MusicNote() {
	return (
		<Svg fill="currentColor">
			<path d="M20 4.2a1 1 0 0 0-1.2-1L10 5.05a1 1 0 0 0-.78.98v8.63A3.5 3.5 0 1 0 11 17.7V9.3l7-1.5v4.06A3.5 3.5 0 1 0 20 15V4.2z" />
		</Svg>
	);
}

export function Camera({ stroke = 1.7 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round">
			<path d="M4 8h2.7L8.2 5.8a1 1 0 0 1 .83-.44h5.94a1 1 0 0 1 .83.44L17.3 8H20a1.5 1.5 0 0 1 1.5 1.5v8.3A1.5 1.5 0 0 1 20 19.3H4a1.5 1.5 0 0 1-1.5-1.5V9.5A1.5 1.5 0 0 1 4 8z" />
			<circle cx="12" cy="13" r="3.2" />
		</Svg>
	);
}

export function Magnifier({ stroke = 2 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
			<circle cx="10.8" cy="10.8" r="6.6" />
			<path d="m20 20-4.5-4.5" />
		</Svg>
	);
}

export function BackChevron({ stroke = 2 }: GlyphProps) {
	return (
		<Svg
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M15 5 8 12l7 7" />
		</Svg>
	);
}

/** Plus glyph for the TikTok follow badge. */
export function Plus({ stroke = 2.6 }: GlyphProps) {
	return (
		<Svg fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
			<path d="M12 5.5v13M5.5 12h13" />
		</Svg>
	);
}

/** Head-and-shoulders silhouette that fills a placeholder avatar. */
export function PersonSilhouette() {
	return (
		<Svg fill="rgba(255,255,255,0.92)">
			<circle cx="12" cy="9" r="4.2" />
			<path d="M3.5 22c.7-4.4 4.2-7 8.5-7s7.8 2.6 8.5 7z" />
		</Svg>
	);
}

export function VerifiedBadge({ fill }: { fill: string }) {
	return (
		<Svg>
			<path
				fill={fill}
				d="m12 2 2.02 1.53 2.52-.24 1.02 2.32 2.32 1.02-.24 2.52L23 12l-1.34 2.53.24 2.52-2.32 1.02-1.02 2.32-2.52-.24L12 22l-2.02-1.53-2.52.24-1.02-2.32-2.32-1.02.24-2.52L1 12l1.34-2.53-.24-2.52 2.32-1.02L5.44 3.3l2.52.24z"
			/>
			<path fill="#fff" d="m10.6 15.2-2.9-2.9 1.3-1.32 1.6 1.6 4-4.02 1.32 1.32z" />
		</Svg>
	);
}

/* ─────────── brand marks ─────────── */

/** Render a simple-icons path (its `.path` d string) in a chosen color. */
export function BrandMark({ path, color }: { path: string; color: string }) {
	return (
		<Svg fill={color}>
			<path d={path} />
		</Svg>
	);
}

/**
 * Recreated LinkedIn "in" mark (absent from simple-icons for trademark reasons).
 * The rounded tile paints in `currentColor` so callers pass LinkedIn blue; the
 * letterforms are knocked out in white.
 */
export function LinkedInMark() {
	return (
		<Svg fill="currentColor">
			<rect width="24" height="24" rx="5" />
			<circle cx="6.6" cy="6.8" r="1.9" fill="#fff" />
			<rect x="4.8" y="9.6" width="3.6" height="9.6" fill="#fff" />
			<path
				fill="#fff"
				d="M10.4 9.6h3.45v1.35h.05c.5-.9 1.7-1.6 3.2-1.6 2.55 0 3.9 1.5 3.9 4.15v5.7h-3.6v-5.05c0-1.2-.45-2-1.6-2-1.05 0-1.65.7-1.9 1.4-.1.25-.1.6-.1.95v4.7h-3.4z"
			/>
		</Svg>
	);
}
