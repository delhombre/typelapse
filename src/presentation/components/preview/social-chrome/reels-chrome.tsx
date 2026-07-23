import type { SafeZone } from "@/application/social/safe-zones";
import { Camera, CommentOutline, DotsVertical, HeartOutline, MusicNote, PaperPlane } from "./icons";
import {
	AudioThumb,
	Avatar,
	EdgeScrim,
	GlyphBox,
	Pill,
	Rail,
	RailButton,
	feedText,
} from "./shared";

const RAIL_ICON = "2.7em";
const COUNT = "1.1em";
const RAIL_RIGHT = "3%";
const RAIL_BOTTOM = "12%";
const RAIL_GAP = "1.1em";

/** Instagram Reels: "Reels" wordmark + camera, outline rail, follow-row caption. */
export function ReelsChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="16%" alpha={0.28} />
			<EdgeScrim edge="bottom" size="40%" alpha={0.4} />
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
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<PaperPlane />
						</GlyphBox>
					}
					label="1.1K"
					labelSize={COUNT}
				/>
				<GlyphBox size="2.3em">
					<DotsVertical />
				</GlyphBox>
				<AudioThumb size="2.6em" />
			</Rail>
			<Caption zone={zone} />
		</>
	);
}

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
			<span style={feedText({ size: "1.9em", weight: 700 })}>Reels</span>
			<GlyphBox size="2em">
				<Camera />
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
				<Pill label="Follow" size="1.05em" border="0.12em solid rgba(255,255,255,0.9)" />
			</div>
			<span style={{ ...feedText({ size: "1.2em", weight: 500 }), whiteSpace: "normal" }}>
				Shipping a new feature
			</span>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<GlyphBox size="1.25em">
					<MusicNote />
				</GlyphBox>
				<span style={feedText({ size: "1.12em", weight: 500 })}>yourhandle · Original audio</span>
			</div>
		</div>
	);
}
