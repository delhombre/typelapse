import {
	type OccludedRegion,
	PLATFORM_LABELS,
	type SafeZone,
	type SocialPlatform,
	occludedRegions,
	safeZoneFor,
} from "@/application/social/safe-zones";
import { AnimatePresence, type Transition, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

interface SocialPreviewOverlayProps {
	platform: SocialPlatform;
	showGuides: boolean;
	/** Outer corner radius of the card, so scrims and labels never overhang it. */
	radius: number;
}

/**
 * A preview-only, GENERIC evocation of a platform feed drawn on top of the
 * export card. It carries NO real logos, wordmarks or brand colors: plain
 * geometric glyphs and the platform name as text, so it reads as UI furniture,
 * not as the user's content. It is a design aid, never captured by the PNG or
 * baked into the video (it lives outside [data-export-target]).
 *
 * Layer A (chrome) always shows; Layer B (safe-zone guides) toggles on top.
 * All geometry comes from the safe-zone spec as fractions, and every size is
 * expressed in `cqmin`-based `em`, so the whole mockup scales with the card.
 */
export function SocialPreviewOverlay({ platform, showGuides, radius }: SocialPreviewOverlayProps) {
	const reduce = useReducedMotion();
	const hidden = reduce ? { opacity: 0 } : { opacity: 0, scale: 1.015 };
	const shown = { opacity: 1, scale: 1 };
	const appear: Transition = reduce
		? { duration: 0 }
		: { type: "spring", bounce: 0, duration: 0.45 };
	const swap: Transition = reduce ? { duration: 0 } : { duration: 0.28 };

	return (
		<motion.div
			aria-hidden
			className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
			style={{ borderRadius: radius, containerType: "size" }}
			initial={hidden}
			animate={shown}
			exit={hidden}
			transition={appear}
		>
			{/* Cross-dissolve the chrome + guides when the platform changes; the
			    container-query root above keeps cqmin stable through the swap. */}
			<AnimatePresence mode="wait">
				<motion.div
					key={platform}
					className="absolute inset-0"
					style={{ fontSize: "2.7cqmin" }}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={swap}
				>
					<PlatformChrome platform={platform} />
					{showGuides && <SafeZoneGuides regions={occludedRegions(platform)} />}
				</motion.div>
			</AnimatePresence>
		</motion.div>
	);
}

/* ──────────── Layer A: feed chrome ──────────── */

function PlatformChrome({ platform }: { platform: SocialPlatform }) {
	const zone = safeZoneFor(platform);
	const label = PLATFORM_LABELS[platform];
	if (platform === "linkedin") {
		return <LinkedInChrome zone={zone} label={label} />;
	}
	return <VerticalChrome platform={platform} zone={zone} label={label} />;
}

/** Reels / TikTok / Shorts / X: right action rail + bottom caption + top hint. */
function VerticalChrome({
	platform,
	zone,
	label,
}: {
	platform: SocialPlatform;
	zone: SafeZone;
	label: string;
}) {
	const hasTopRow = occludedRegions(platform).some((r) => r.edge === "top");
	const showBookmark = platform === "shorts";
	const showAudio = platform === "reels" || platform === "tiktok";

	return (
		<>
			<div style={scrim("top", 0.28)} />
			<div style={scrim("bottom", 0.36)} />
			<TopHint zone={zone} label={label} full={hasTopRow} />
			<ActionRail zone={zone} bookmark={showBookmark} />
			<CaptionBlock zone={zone} audio={showAudio} />
		</>
	);
}

/** LinkedIn: an in-feed card frame with a header and a reactions bar. */
function LinkedInChrome({ zone, label }: { zone: SafeZone; label: string }) {
	return (
		<>
			<div style={scrim("top", 0.16)} />
			<div style={scrim("bottom", 0.18)} />
			<div
				style={{
					position: "absolute",
					top: `${zone.top * 100 + 3}%`,
					left: `${zone.left * 100 + 3}%`,
					right: `${zone.right * 100 + 3}%`,
					display: "flex",
					alignItems: "center",
					gap: "0.7em",
					filter: SHADOW,
				}}
			>
				<Dot size="2.5em" />
				<div style={{ display: "flex", flexDirection: "column", gap: "0.4em" }}>
					<Bar width="7em" height="0.5em" alpha={0.85} />
					<Bar width="4.6em" height="0.4em" alpha={0.5} />
				</div>
				<div style={{ marginLeft: "auto" }}>
					<PlatformTag label={label} />
				</div>
			</div>
			<div
				style={{
					position: "absolute",
					bottom: "4%",
					left: `${zone.left * 100 + 3}%`,
					right: `${zone.right * 100 + 3}%`,
					paddingTop: "0.7em",
					borderTop: "1px solid rgba(255,255,255,0.18)",
					display: "flex",
					gap: "1.8em",
					filter: SHADOW,
				}}
			>
				<ReactionItem glyph={<ThumbGlyph />} />
				<ReactionItem glyph={<CommentGlyph />} />
				<ReactionItem glyph={<ShareGlyph />} />
			</div>
		</>
	);
}

/** Top progress hint + name row (full) or just a centered platform tag. */
function TopHint({ zone, label, full }: { zone: SafeZone; label: string; full: boolean }) {
	if (!full) {
		return (
			<div style={{ position: "absolute", top: "4%", left: 0, right: 0, textAlign: "center" }}>
				<PlatformTag label={label} />
			</div>
		);
	}
	return (
		<div
			style={{
				position: "absolute",
				top: "3.2%",
				left: `${zone.left * 100 + 3}%`,
				right: `${zone.right * 100 + 3}%`,
				filter: SHADOW,
			}}
		>
			<div style={{ display: "flex", gap: "0.45em" }}>
				{[0, 1, 2, 3, 4].map((i) => (
					<div
						key={i}
						style={{
							height: "0.28em",
							flex: 1,
							borderRadius: "999px",
							background: i === 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
						}}
					/>
				))}
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: "0.55em", marginTop: "1.1em" }}>
				<Dot size="1.8em" />
				<Bar width="34%" height="0.5em" alpha={0.8} />
				<div style={{ marginLeft: "auto" }}>
					<PlatformTag label={label} />
				</div>
			</div>
		</div>
	);
}

/** Right-hand action rail: avatar, heart, comment, share, (+ bookmark). */
function ActionRail({ zone, bookmark }: { zone: SafeZone; bookmark: boolean }) {
	return (
		<div
			style={{
				position: "absolute",
				right: "3.5%",
				bottom: `${zone.bottom * 100 + 3}%`,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "1.05em",
				filter: SHADOW,
			}}
		>
			<AvatarGlyph />
			<HeartGlyph />
			<CommentGlyph />
			<ShareGlyph />
			{bookmark && <BookmarkGlyph />}
		</div>
	);
}

/** Bottom-left caption stand-in: handle line, two caption lines, audio ticker. */
function CaptionBlock({ zone, audio }: { zone: SafeZone; audio: boolean }) {
	return (
		<div
			style={{
				position: "absolute",
				left: `${zone.left * 100 + 3}%`,
				right: `${zone.right * 100 + 8}%`,
				bottom: "5%",
				display: "flex",
				flexDirection: "column",
				gap: "0.6em",
				filter: SHADOW,
			}}
		>
			<Bar width="42%" height="0.55em" alpha={0.85} />
			<Bar width="100%" height="0.42em" alpha={0.5} />
			<Bar width="66%" height="0.42em" alpha={0.5} />
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em", marginTop: "0.15em" }}>
				{audio ? <MusicGlyph size="1.5em" /> : <Dot size="1.1em" />}
				<Bar width="46%" height="0.4em" alpha={0.5} />
			</div>
		</div>
	);
}

function ReactionItem({ glyph }: { glyph: ReactNode }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "0.4em" }}>
			{glyph}
			<Bar width="2.6em" height="0.4em" alpha={0.5} />
		</div>
	);
}

/* ──────────── Layer B: safe-zone guides ──────────── */

function SafeZoneGuides({ regions }: { regions: readonly OccludedRegion[] }) {
	return (
		<>
			{regions.map((region) => (
				<GuideBand key={region.edge} region={region} />
			))}
		</>
	);
}

function GuideBand({ region }: { region: OccludedRegion }) {
	const { edge, fraction, label } = region;
	const size = `${fraction * 100}%`;
	const vertical = edge === "left" || edge === "right";
	const style: CSSProperties = {
		position: "absolute",
		background: "rgba(0,0,0,0.28)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	};
	if (edge === "top") {
		Object.assign(style, { top: 0, left: 0, right: 0, height: size, borderBottom: HAIRLINE });
	}
	if (edge === "bottom") {
		Object.assign(style, { bottom: 0, left: 0, right: 0, height: size, borderTop: HAIRLINE });
	}
	if (edge === "left") {
		Object.assign(style, { top: 0, bottom: 0, left: 0, width: size, borderRight: HAIRLINE });
	}
	if (edge === "right") {
		Object.assign(style, { top: 0, bottom: 0, right: 0, width: size, borderLeft: HAIRLINE });
	}
	return (
		<div style={style}>
			<span
				style={{
					fontSize: "0.82em",
					fontWeight: 600,
					letterSpacing: "0.03em",
					color: "rgba(255,255,255,0.92)",
					textShadow: "0 0.05em 0.16em rgba(0,0,0,0.65)",
					writingMode: vertical ? "vertical-rl" : "horizontal-tb",
					whiteSpace: "nowrap",
					padding: "0.3em",
				}}
			>
				{label}
			</span>
		</div>
	);
}

/* ──────────── Primitives ──────────── */

const SHADOW = "drop-shadow(0 0.05em 0.12em rgba(0,0,0,0.35))";
const HAIRLINE = "1px solid rgba(255,255,255,0.35)";

/** A faint feed gradient at an edge: makes white furniture legible on any theme. */
function scrim(edge: "top" | "bottom", alpha: number): CSSProperties {
	const dir = edge === "top" ? "to bottom" : "to top";
	const base: CSSProperties = {
		position: "absolute",
		left: 0,
		right: 0,
		height: edge === "top" ? "24%" : "34%",
		background: `linear-gradient(${dir}, rgba(0,0,0,${alpha}), rgba(0,0,0,0))`,
	};
	base[edge] = 0;
	return base;
}

function PlatformTag({ label }: { label: string }) {
	return (
		<span
			style={{
				fontSize: "0.82em",
				fontWeight: 600,
				letterSpacing: "0.07em",
				textTransform: "uppercase",
				color: "rgba(255,255,255,0.78)",
				textShadow: "0 0.05em 0.15em rgba(0,0,0,0.45)",
				whiteSpace: "nowrap",
			}}
		>
			{label}
		</span>
	);
}

function Dot({ size }: { size: string }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: "999px",
				background: "rgba(255,255,255,0.85)",
			}}
		/>
	);
}

function Bar({ width, height, alpha }: { width: string; height: string; alpha: number }) {
	return (
		<div
			style={{
				width,
				height,
				borderRadius: "999px",
				background: `rgba(255,255,255,${alpha})`,
			}}
		/>
	);
}

function IconBox({ size = "2.2em", children }: { size?: string; children: ReactNode }) {
	return (
		<div style={{ width: size, height: size, color: "rgba(255,255,255,0.9)" }}>{children}</div>
	);
}

/* ──────────── Generic glyphs (no brand marks) ──────────── */

function AvatarGlyph() {
	return (
		<IconBox>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10.5" />
				<circle cx="12" cy="9.6" r="3.1" fill="currentColor" stroke="none" />
				<path d="M5.8 18.6c1.3-2.8 3.6-4.1 6.2-4.1s4.9 1.3 6.2 4.1" strokeLinecap="round" />
			</svg>
		</IconBox>
	);
}

function HeartGlyph() {
	return (
		<IconBox>
			<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12 20.6C10.9 19.6 4 14.7 4 9.6 4 7 6 5 8.5 5c1.7 0 3.1.9 3.5 2.2C12.4 5.9 13.8 5 15.5 5 18 5 20 7 20 9.6c0 5.1-6.9 10-8 11z" />
			</svg>
		</IconBox>
	);
}

function CommentGlyph() {
	return (
		<IconBox>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M4 5.5h16a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9.5L5 20v-3.5H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" />
			</svg>
		</IconBox>
	);
}

function ShareGlyph() {
	return (
		<IconBox>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
				aria-hidden="true"
			>
				<circle cx="18" cy="5.5" r="2.4" />
				<circle cx="6" cy="12" r="2.4" />
				<circle cx="18" cy="18.5" r="2.4" />
				<path d="M8.1 10.9 15.9 6.6M8.1 13.1l7.8 4.3" strokeLinecap="round" />
			</svg>
		</IconBox>
	);
}

function BookmarkGlyph() {
	return (
		<IconBox>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z" />
			</svg>
		</IconBox>
	);
}

function MusicGlyph({ size }: { size: string }) {
	return (
		<IconBox size={size}>
			<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M10 17.5V7l8-1.8V15" fill="none" stroke="currentColor" strokeWidth="1.7" />
				<circle cx="7.6" cy="17.6" r="2.4" />
				<circle cx="15.6" cy="15.5" r="2.4" />
			</svg>
		</IconBox>
	);
}

function ThumbGlyph() {
	return (
		<IconBox size="1.6em">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M7 10.5v8.5H4.2A1.2 1.2 0 0 1 3 18.3v-6.6a1.2 1.2 0 0 1 1.2-1.2H7z" />
				<path d="M7 10.5 11 3.4c1.1 0 1.9.9 1.9 1.9V9h4.8a2 2 0 0 1 2 2.4l-1 6a2 2 0 0 1-2 1.6H7" />
			</svg>
		</IconBox>
	);
}
