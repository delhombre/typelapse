import type { SafeZone } from "@/application/social/safe-zones";
import {
	BookmarkSolid,
	CommentSolid,
	ForwardArrow,
	HeartSolid,
	Magnifier,
	MusicNote,
} from "./icons";
import {
	Avatar,
	EdgeScrim,
	GlyphBox,
	PlusBadge,
	Rail,
	RailButton,
	SpinningDisc,
	feedText,
} from "./shared";

/* Tunables: sizes are `em` on the overlay's cqmin root (1em ~ 2.7% of the short
   side), so tweak these to re-scale the whole TikTok rail. */
const RAIL_ICON = "2.85em";
const AVATAR = "4.55em";
const DISC = "3.1em";
const COUNT = "1.15em";
const RAIL_RIGHT = "3%";
const RAIL_BOTTOM = "12%";
const RAIL_GAP = "1.05em";
const TIKTOK_RED = "#FE2C55";

/** TikTok immersive feed: For-You tabs, a bold right rail, caption + audio row. */
export function TikTokChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="18%" alpha={0.32} />
			<EdgeScrim edge="bottom" size="42%" alpha={0.42} />
			<TopBar />
			<Rail right={RAIL_RIGHT} bottom={RAIL_BOTTOM} gap={RAIL_GAP}>
				<Avatar size={AVATAR} badge={<PlusBadge color={TIKTOK_RED} size="1.5em" />} />
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<HeartSolid />
						</GlyphBox>
					}
					label="328.7K"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<CommentSolid />
						</GlyphBox>
					}
					label="1204"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<BookmarkSolid />
						</GlyphBox>
					}
					label="18.2K"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<ForwardArrow />
						</GlyphBox>
					}
					label="Share"
					labelSize={COUNT}
				/>
				<SpinningDisc size={DISC} />
			</Rail>
			<Caption zone={zone} />
		</>
	);
}

function TopBar() {
	return (
		<div style={{ position: "absolute", top: "3%", left: 0, right: 0 }}>
			<div
				style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.4em" }}
			>
				<span style={feedText({ size: "1.35em", weight: 600, dim: true })}>Following</span>
				<div
					style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3em" }}
				>
					<span style={feedText({ size: "1.35em", weight: 700 })}>For You</span>
					<div
						style={{ width: "1.1em", height: "0.16em", borderRadius: "999px", background: "#fff" }}
					/>
				</div>
			</div>
			<div style={{ position: "absolute", top: 0, right: "4%" }}>
				<GlyphBox size="2em">
					<Magnifier />
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
				right: "22%",
				bottom: "5%",
				display: "flex",
				flexDirection: "column",
				gap: "0.55em",
			}}
		>
			<span style={feedText({ size: "1.35em", weight: 700 })}>@yourhandle</span>
			<span style={{ ...feedText({ size: "1.2em", weight: 500 }), whiteSpace: "normal" }}>
				Building in public #code #dev
			</span>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<GlyphBox size="1.3em">
					<MusicNote />
				</GlyphBox>
				<span style={feedText({ size: "1.15em", weight: 500 })}>original sound - yourhandle</span>
			</div>
		</div>
	);
}
