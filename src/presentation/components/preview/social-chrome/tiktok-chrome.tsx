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
	LiveSquare,
	PlusBadge,
	Rail,
	RailButton,
	SpinningDisc,
	feedText,
} from "./shared";

/* Sizes are `em` on the overlay's cqmin root (1em ~ 2.7% of the short side).
   Corrected 2026-08-10 against the live app + App Store v46.3.0
   (docs/decisions/2026-08-10-social-chrome-reference.md). */
const RAIL_ICON = "2.85em";
const AVATAR = "4.55em";
const DISC = "3.1em";
const COUNT = "1.15em";
const RAIL_RIGHT = "3%";
const RAIL_BOTTOM = "12%";
const RAIL_GAP = "1.05em";
const TIKTOK_RED = "#FE2C55";

/** TikTok immersive feed: LIVE + For-You tabs, a bold filled right rail, caption. */
export function TikTokChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			{/* Top is a near-flat band on the real app, not a tall ramp; the body
			    darkens gradually toward the caption. */}
			<EdgeScrim edge="top" size="9%" alpha={0.5} />
			<EdgeScrim edge="bottom" size="52%" alpha={0.5} />
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
				{/* Share now carries a count, not the word "Share". */}
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<ForwardArrow />
						</GlyphBox>
					}
					label="2281"
					labelSize={COUNT}
				/>
				<SpinningDisc size={DISC} />
			</Rail>
			<Caption zone={zone} />
		</>
	);
}

/* Real top bar: a LIVE entry left, and centre tabs separated by a thin divider —
   no underline pill under the active tab. `Following` carries a red unread dot. */
function TopBar() {
	return (
		<div
			style={{ position: "absolute", top: "calc(var(--safe-top, 0px) + 3%)", left: 0, right: 0 }}
		>
			<div style={{ position: "absolute", top: "-0.15em", left: "4%" }}>
				<LiveSquare size="2.15em" />
			</div>
			<div
				style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.9em" }}
			>
				<span style={{ position: "relative", display: "inline-flex" }}>
					<span style={feedText({ size: "1.35em", weight: 600, dim: true })}>Following</span>
					<span
						style={{
							position: "absolute",
							top: "-0.1em",
							right: "-0.45em",
							width: "0.4em",
							height: "0.4em",
							borderRadius: "999px",
							background: TIKTOK_RED,
						}}
					/>
				</span>
				<span style={{ width: "0.09em", height: "1.2em", background: "rgba(255,255,255,0.45)" }} />
				<span style={feedText({ size: "1.35em", weight: 700 })}>For You</span>
			</div>
			<div style={{ position: "absolute", top: "0.05em", right: "4%" }}>
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
