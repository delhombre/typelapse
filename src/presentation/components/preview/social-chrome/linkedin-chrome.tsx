import type { SafeZone } from "@/application/social/safe-zones";
import type { ReactNode } from "react";
import {
	BellSolid,
	BriefcaseSolid,
	CommentLines,
	DotsHorizontal,
	ForwardArrow,
	HouseSolid,
	PeoplePairSolid,
	PlayTriangle,
	ThumbUpSolid,
	VolumeSolid,
} from "./icons";
import { Avatar, DIM_WHITE, EdgeScrim, GlyphBox, Pill, Rail, RailButton, feedText } from "./shared";

/* Redrawn 2026-08-10 as the full-screen Video-tab player, replacing the in-feed
   card (docs/decisions/2026-08-10-social-chrome-reference.md; press renders —
   the live app is login-walled). Read off the captures: the rail glyphs are
   SOLID white (like `258` / comment `14` / share, volume set apart lower), not
   the outline set the reference first guessed, and the bottom is an opaque
   white nav where Video sits selected as a black play tile. */
const NOTIF_RED = "#CD141A";
const NAV_TEXT = "#5a5a5a";
const NAV_ACTIVE = "#191919";
/** The opaque nav (tabs + home indicator); everything else stacks above it. */
const NAV_H = "4.7em";
const RAIL_ICON = "2.45em";
const COUNT = "1.1em";

/** LinkedIn Video tab: solid white rail, author + caption, opaque bottom nav. */
export function LinkedInChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="12%" alpha={0.25} />
			<EdgeScrim edge="bottom" size="34%" alpha={0.38} />
			<TopBar />
			<ActionRail />
			<Caption zone={zone} />
			<Scrubber />
			<BottomNav />
		</>
	);
}

/* The only top furniture the captures show is an overflow control. */
function TopBar() {
	return (
		<div style={{ position: "absolute", top: "calc(var(--safe-top, 0px) + 3.2%)", right: "4%" }}>
			<GlyphBox size="1.9em">
				<DotsHorizontal />
			</GlyphBox>
		</div>
	);
}

/* Like / comment / share, then volume set apart below — no repost and no send
   here, those live only in the feed card. */
function ActionRail() {
	return (
		<Rail right="3%" bottom={`calc(${NAV_H} + 9.5em)`} gap="1.35em">
			<RailButton
				icon={
					<GlyphBox size={RAIL_ICON}>
						<ThumbUpSolid />
					</GlyphBox>
				}
				label="258"
				labelSize={COUNT}
			/>
			<RailButton
				icon={
					<GlyphBox size={RAIL_ICON}>
						<CommentLines />
					</GlyphBox>
				}
				label="14"
				labelSize={COUNT}
			/>
			<GlyphBox size={RAIL_ICON}>
				<ForwardArrow />
			</GlyphBox>
			<div style={{ marginTop: "1.1em" }}>
				<GlyphBox size="2.15em">
					<VolumeSolid />
				</GlyphBox>
			</div>
		</Rail>
	);
}

function Caption({ zone }: { zone: SafeZone }) {
	return (
		<div
			style={{
				position: "absolute",
				left: `${zone.left * 100}%`,
				right: "17%",
				bottom: `calc(${NAV_H} + 1.7em)`,
				display: "flex",
				flexDirection: "column",
				gap: "0.55em",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
				<Avatar size="2.9em" ringColor="transparent" ringWidth="0" />
				<div style={{ display: "flex", flexDirection: "column", gap: "0.25em", minWidth: 0 }}>
					<div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
						<span style={feedText({ size: "1.25em", weight: 700 })}>Your Name</span>
						<Pill
							label="Follow"
							size="1em"
							border="0.09em solid rgba(255,255,255,0.85)"
							radius="999px"
						/>
					</div>
					<span
						style={{
							...feedText({ size: "1.05em", weight: 400, dim: true }),
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{"@yourhandle (12k+) Software Engineer // Building in public"}
					</span>
				</div>
			</div>
			<span style={{ ...feedText({ size: "1.15em", weight: 400 }), whiteSpace: "normal" }}>
				Building this in TypeScript. <span style={{ color: DIM_WHITE }}>…see more</span>
			</span>
		</div>
	);
}

/* A thin full-width progress line sitting directly on top of the nav — the
   video does not run edge-to-edge past it. */
function Scrubber() {
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: `calc(${NAV_H} + 0.55em)`,
				height: "0.22em",
				background: "rgba(255,255,255,0.3)",
			}}
		>
			<div
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: 0,
					width: "42%",
					background: "#fff",
				}}
			/>
		</div>
	);
}

function BottomNav() {
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				height: NAV_H,
				background: "#fff",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-around",
					padding: "0.3em 0.4em 0",
				}}
			>
				<NavTab icon={<HouseSolid />} label="Home" />
				<NavTab icon={<VideoTile />} label="Video" active />
				<NavTab icon={<PeoplePairSolid />} label="My Network" />
				<NavTab icon={<BellBadged />} label="Notifications" />
				<NavTab icon={<BriefcaseSolid />} label="Jobs" />
			</div>
			<HomeIndicator />
		</div>
	);
}

function NavTab({ icon, label, active }: { icon: ReactNode; label: string; active?: boolean }) {
	const color = active ? NAV_ACTIVE : NAV_TEXT;
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.28em" }}>
			<GlyphBox size="1.55em" color={color} shadow={false}>
				{icon}
			</GlyphBox>
			<span
				style={{
					fontSize: "0.8em",
					fontWeight: active ? 600 : 500,
					color,
					lineHeight: 1,
					whiteSpace: "nowrap",
				}}
			>
				{label}
			</span>
		</div>
	);
}

/** The selected Video tab: a filled dark rounded square with a play glyph. */
function VideoTile() {
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				borderRadius: "0.3em",
				background: NAV_ACTIVE,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				color: "#fff",
			}}
		>
			<span style={{ width: "58%", height: "58%", display: "inline-flex" }}>
				<PlayTriangle />
			</span>
		</div>
	);
}

function BellBadged() {
	return (
		<span style={{ position: "relative", display: "inline-flex", width: "100%", height: "100%" }}>
			<BellSolid />
			<span
				style={{
					position: "absolute",
					top: "-0.35em",
					right: "-0.85em",
					background: NOTIF_RED,
					color: "#fff",
					borderRadius: "999px",
					fontSize: "0.55em",
					fontWeight: 700,
					lineHeight: 1,
					padding: "0.25em 0.4em",
				}}
			>
				20+
			</span>
		</span>
	);
}

function HomeIndicator() {
	return (
		<div style={{ display: "flex", justifyContent: "center", padding: "0.25em 0 0.45em" }}>
			<div
				style={{ width: "7.5em", height: "0.32em", borderRadius: "999px", background: "#111" }}
			/>
		</div>
	);
}
