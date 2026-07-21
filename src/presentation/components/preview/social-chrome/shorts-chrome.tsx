import type { SafeZone } from "@/application/social/safe-zones";
import type { ReactNode } from "react";
import { siYoutubeshorts } from "simple-icons";
import {
	BrandMark,
	CommentOutline,
	DotsVertical,
	ForwardArrow,
	Magnifier,
	MusicNote,
	Remix,
	ThumbDown,
	ThumbUp,
} from "./icons";
import { Avatar, EdgeScrim, GlyphBox, ICON_SHADOW, Pill, Rail, feedText } from "./shared";

const CHIP = "3.35em";
const CHIP_ICON = "1.95em";
const COUNT = "1.05em";
const RAIL_RIGHT = "2.5%";
const RAIL_BOTTOM = "11%";
const RAIL_GAP = "0.85em";
const DISC = "3.1em";
const YOUTUBE_RED = "#FF0000";

/** YouTube Shorts: Shorts mark + search/kebab, chipped rail, subscribe caption. */
export function ShortsChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="15%" alpha={0.26} />
			<EdgeScrim edge="bottom" size="38%" alpha={0.4} />
			<TopBar zone={zone} />
			<Rail right={RAIL_RIGHT} bottom={RAIL_BOTTOM} gap={RAIL_GAP}>
				<ChipButton label="15K" icon={<ThumbUp />} />
				<ChipButton label="Dislike" icon={<ThumbDown />} />
				<ChipButton label="88" icon={<CommentOutline />} />
				<ChipButton label="Share" icon={<ForwardArrow />} />
				<ChipButton label="Remix" icon={<Remix />} />
				<DiscChip />
			</Rail>
			<Caption zone={zone} />
		</>
	);
}

function ChipButton({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35em" }}>
			<div
				style={{
					width: CHIP,
					height: CHIP,
					borderRadius: "999px",
					background: "rgba(90,90,90,0.42)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					filter: ICON_SHADOW,
				}}
			>
				<GlyphBox size={CHIP_ICON} shadow={false}>
					{icon}
				</GlyphBox>
			</div>
			<span style={feedText({ size: COUNT, weight: 600 })}>{label}</span>
		</div>
	);
}

function DiscChip() {
	return (
		<div
			style={{
				width: CHIP,
				height: CHIP,
				borderRadius: "0.6em",
				overflow: "hidden",
				border: "0.12em solid rgba(255,255,255,0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "linear-gradient(150deg, #f06, #90f)",
				filter: ICON_SHADOW,
			}}
		>
			<GlyphBox size={DISC} shadow={false}>
				<MusicNote />
			</GlyphBox>
		</div>
	);
}

function TopBar({ zone }: { zone: SafeZone }) {
	return (
		<div
			style={{
				position: "absolute",
				top: "3.4%",
				left: `${zone.left * 100}%`,
				right: "4%",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<GlyphBox size="1.7em">
					<BrandMark path={siYoutubeshorts.path} color="#fff" />
				</GlyphBox>
				<span style={feedText({ size: "1.6em", weight: 700 })}>Shorts</span>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
				<GlyphBox size="1.9em">
					<Magnifier />
				</GlyphBox>
				<GlyphBox size="1.7em">
					<DotsVertical />
				</GlyphBox>
			</div>
		</div>
	);
}

function Caption({ zone }: { zone: SafeZone }) {
	return (
		<div
			style={{
				position: "absolute",
				left: `${zone.left * 100}%`,
				right: "20%",
				bottom: "5%",
				display: "flex",
				flexDirection: "column",
				gap: "0.6em",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
				<Avatar size="2.3em" ringWidth="0.1em" />
				<span style={feedText({ size: "1.25em", weight: 700 })}>@yourchannel</span>
				<Pill label="Subscribe" size="1.05em" background={YOUTUBE_RED} color="#fff" />
			</div>
			<span style={{ ...feedText({ size: "1.2em", weight: 500 }), whiteSpace: "normal" }}>
				How I built this in TypeScript
			</span>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<GlyphBox size="1.25em">
					<MusicNote />
				</GlyphBox>
				<span style={feedText({ size: "1.12em", weight: 500 })}>
					How I built this · yourchannel
				</span>
			</div>
		</div>
	);
}
