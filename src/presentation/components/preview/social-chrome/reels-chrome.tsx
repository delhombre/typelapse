import type { SafeZone } from "@/application/social/safe-zones";
import { CommentOutline, DotsHorizontal, HeartOutline, PaperPlane, Repost, Tune } from "./icons";
import {
	Avatar,
	AvatarStack,
	EdgeScrim,
	GlyphBox,
	Pill,
	Rail,
	RailButton,
	feedText,
} from "./shared";

/* Corrected 2026-08-10 against the live app + App Store v441.0.0
   (docs/decisions/2026-08-10-social-chrome-reference.md). */
const RAIL_ICON = "2.7em";
const COUNT = "1.1em";
const RAIL_RIGHT = "3%";
const RAIL_BOTTOM = "12%";
const RAIL_GAP = "1.2em";

/** Instagram Reels: Reels|Friends tabs, an all-outline rail, follow-row caption
    with a Liked-by proof row (the audio ticker is gone on the current app). */
export function ReelsChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="20%" alpha={0.35} />
			<EdgeScrim edge="bottom" size="30%" alpha={0.35} />
			<TopBar zone={zone} />
			<Rail right={RAIL_RIGHT} bottom={RAIL_BOTTOM} gap={RAIL_GAP}>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<HeartOutline />
						</GlyphBox>
					}
					label="12.4K"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<CommentOutline />
						</GlyphBox>
					}
					label="203"
					labelSize={COUNT}
				/>
				{/* Repost joined the rail; there is no bookmark here (saving is behind
				    the dots), and share/dots carry no count. */}
				<GlyphBox size={RAIL_ICON}>
					<Repost />
				</GlyphBox>
				<GlyphBox size={RAIL_ICON}>
					<PaperPlane />
				</GlyphBox>
				<GlyphBox size="2.3em">
					<DotsHorizontal />
				</GlyphBox>
			</Rail>
			<Caption zone={zone} />
		</>
	);
}

/* `Reels` and `Friends` tabs with a small avatar cluster, a thin + at the left
   and a tune control at the right — the old wordmark + camera is gone. */
function TopBar({ zone }: { zone: SafeZone }) {
	return (
		<div
			style={{
				position: "absolute",
				top: "calc(var(--safe-top, 0px) + 3.8%)",
				left: `${zone.left * 100}%`,
				right: "4%",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
			}}
		>
			<span style={{ ...feedText({ size: "2em", weight: 300 }), lineHeight: 1 }}>+</span>
			<div style={{ display: "flex", alignItems: "center", gap: "0.7em" }}>
				<span style={feedText({ size: "1.7em", weight: 700 })}>Reels</span>
				<span style={feedText({ size: "1.7em", weight: 700, dim: true })}>Friends</span>
				<AvatarStack size="1.35em" count={3} />
			</div>
			<GlyphBox size="2em">
				<Tune />
			</GlyphBox>
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
				<Avatar size="2.2em" ringWidth="0.1em" />
				<span style={feedText({ size: "1.25em", weight: 700 })}>yourhandle</span>
				{/* A rounded rect, not a full pill: ~1pt white/60 border, transparent. */}
				<Pill label="Follow" size="1.05em" border="0.1em solid rgba(255,255,255,0.6)" />
			</div>
			<span style={{ ...feedText({ size: "1.2em", weight: 500 }), whiteSpace: "normal" }}>
				Shipping a new feature
			</span>
			{/* The audio ticker was replaced by a social-proof row. */}
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<AvatarStack size="1.2em" count={3} />
				<span style={feedText({ size: "1.12em", weight: 500, dim: true })}>
					Liked by alex and 1,428 others
				</span>
			</div>
		</div>
	);
}
