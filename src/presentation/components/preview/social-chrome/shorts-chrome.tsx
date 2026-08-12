import type { SafeZone } from "@/application/social/safe-zones";
import { siYoutubeshorts } from "simple-icons";
import {
	BrandMark,
	CommentOutline,
	DotsVertical,
	ForwardArrow,
	Magnifier,
	MusicNote,
	ThumbUp,
} from "./icons";
import {
	Avatar,
	EdgeScrim,
	GlyphBox,
	ICON_SHADOW,
	Pill,
	Rail,
	RailButton,
	feedText,
} from "./shared";

/* Corrected 2026-08-10 against the live m.youtube.com/shorts DOM: three bare
   actions (like/comment/share) + a sound thumbnail, no dislike or remix in the
   rail, and a black Subscribe (YouTube dropped the red years ago). */
const RAIL_ICON = "2.7em";
const COUNT = "1.05em";
const RAIL_RIGHT = "3%";
const RAIL_BOTTOM = "12%";
const RAIL_GAP = "1.15em";
const THUMB = "2.9em";
/** Subscribe is a near-black pill now, not the old red. */
const YT_SUBSCRIBE = "#0f0f0f";

/** YouTube Shorts: wordmark + search/kebab, an outline rail, subscribe caption. */
export function ShortsChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="14%" alpha={0.3} />
			<EdgeScrim edge="bottom" size="40%" alpha={0.42} />
			<TopBar zone={zone} />
			<Rail right={RAIL_RIGHT} bottom={RAIL_BOTTOM} gap={RAIL_GAP}>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<ThumbUp />
						</GlyphBox>
					}
					label="50K"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<CommentOutline />
						</GlyphBox>
					}
					label="296"
					labelSize={COUNT}
				/>
				<GlyphBox size={RAIL_ICON}>
					<ForwardArrow />
				</GlyphBox>
				<SoundThumb />
			</Rail>
			<Caption zone={zone} />
		</>
	);
}

/** The square sound thumbnail that sits at the foot of the rail. */
function SoundThumb() {
	return (
		<div
			style={{
				width: THUMB,
				height: THUMB,
				borderRadius: "0.45em",
				overflow: "hidden",
				border: "0.1em solid rgba(255,255,255,0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "linear-gradient(150deg, #f06, #90f)",
				filter: ICON_SHADOW,
			}}
		>
			<GlyphBox size="1.5em" shadow={false}>
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
				top: "calc(var(--safe-top, 0px) + 3.4%)",
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
				<Pill label="Subscribe" size="1.05em" background={YT_SUBSCRIBE} color="#fff" />
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
