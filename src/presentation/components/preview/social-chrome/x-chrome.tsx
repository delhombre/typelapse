import type { SafeZone } from "@/application/social/safe-zones";
import type { ReactNode } from "react";
import {
	BookmarkOutline,
	CommentOutline,
	ExpandDiagonal,
	HeartOutline,
	PipEnter,
	PlayTriangle,
	RepostAngular,
	ShareUp,
	VerifiedBadge,
	VolumeOutline,
} from "./icons";
import { Avatar, EdgeScrim, GlyphBox, Pill, feedText } from "./shared";

/* Redrawn 2026-08-10 as the Feb-2026 immersive player (X's announcement render +
   App Store v12.15; docs/decisions/2026-08-10-social-chrome-reference.md). The
   old back-header and vertical rail are gone: everything stacks at the bottom —
   author block, caption, a row of translucent action pills, then a media control
   bar whose scrubber runs edge-to-edge. The like here is an outline heart; only
   the in-feed timeline shows the filled pink one. */
const X_BLUE = "#1D9BF0";
/** Translucent black of the action pills (announcement render, ~25-30%). */
const PILL_BG = "rgba(0,0,0,0.28)";
const PILL_H = "2.35em";
const PILL_ICON = "1.3em";

/** X immersive video player: bottom author + caption + pill row + media bar. */
export function XChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="bottom" size="40%" alpha={0.38} />
			<BottomStack zone={zone} />
		</>
	);
}

/* The whole chrome is one bottom-anchored stack; only the scrubber escapes the
   side insets, running the full width of the screen like the real player. */
function BottomStack({ zone }: { zone: SafeZone }) {
	const inset = { paddingLeft: `${zone.left * 100}%`, paddingRight: "4%" };
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: "2.6%",
				display: "flex",
				flexDirection: "column",
				gap: "0.9em",
			}}
		>
			<div style={{ ...inset, display: "flex", flexDirection: "column", gap: "0.8em" }}>
				<AuthorRow />
				<span style={{ ...feedText({ size: "1.15em", weight: 400 }), whiteSpace: "normal" }}>
					Building this in TypeScript. Here is the full walkthrough of the …
				</span>
				<PillRow />
			</div>
			<Scrubber />
			<div style={{ ...inset }}>
				<ControlRow />
			</div>
		</div>
	);
}

function AuthorRow() {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
			<Avatar size="2.7em" ringColor="transparent" ringWidth="0" />
			<div
				style={{ display: "flex", flexDirection: "column", gap: "0.15em", flex: 1, minWidth: 0 }}
			>
				<div style={{ display: "flex", alignItems: "center", gap: "0.35em" }}>
					<span style={feedText({ size: "1.25em", weight: 700 })}>Your Name</span>
					<GlyphBox size="1.1em" shadow={false}>
						<VerifiedBadge fill={X_BLUE} />
					</GlyphBox>
				</div>
				<span style={feedText({ size: "1.1em", weight: 500, dim: true })}>@yourhandle · 1h</span>
			</div>
			<Pill label="Follow" size="1.1em" background="rgba(255,255,255,0.24)" radius="999px" />
		</div>
	);
}

/* Horizontal pills replaced the vertical rail: reply / repost / like carry
   counts, bookmark and share are icon-only circles. */
function PillRow() {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "0.55em" }}>
			<ActionPill icon={<CommentOutline />} label="248" />
			<ActionPill icon={<RepostAngular />} label="3.3K" />
			<ActionPill icon={<HeartOutline />} label="19K" />
			<ActionPill icon={<BookmarkOutline />} />
			<ActionPill icon={<ShareUp />} />
		</div>
	);
}

function ActionPill({ icon, label }: { icon: ReactNode; label?: string }) {
	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.45em",
				height: PILL_H,
				width: label ? undefined : PILL_H,
				padding: label ? "0 0.95em" : 0,
				borderRadius: "999px",
				background: PILL_BG,
			}}
		>
			<GlyphBox size={PILL_ICON} shadow={false}>
				{icon}
			</GlyphBox>
			{label ? (
				<span style={feedText({ size: "1.1em", weight: 500, shadow: false })}>{label}</span>
			) : null}
		</div>
	);
}

function Scrubber() {
	return (
		<div style={{ position: "relative", height: "0.28em", background: "rgba(255,255,255,0.28)" }}>
			<div
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: 0,
					width: "38%",
					background: "#fff",
				}}
			/>
		</div>
	);
}

/* Under the scrubber: play + remaining time left, volume/expand/PiP right. */
function ControlRow() {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
			<div style={{ display: "flex", alignItems: "center", gap: "0.85em" }}>
				<GlyphBox size="1.25em">
					<PlayTriangle />
				</GlyphBox>
				<span style={feedText({ size: "1.2em", weight: 400 })}>-0:20</span>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: "1.5em" }}>
				<GlyphBox size="1.5em">
					<VolumeOutline />
				</GlyphBox>
				<GlyphBox size="1.3em">
					<ExpandDiagonal />
				</GlyphBox>
				<GlyphBox size="1.45em">
					<PipEnter />
				</GlyphBox>
			</div>
		</div>
	);
}
