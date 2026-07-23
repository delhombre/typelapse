import type { SafeZone } from "@/application/social/safe-zones";
import { siX } from "simple-icons";
import {
	BackChevron,
	BrandMark,
	CommentOutline,
	HeartOutline,
	Repost,
	ShareUp,
	VerifiedBadge,
	ViewBars,
} from "./icons";
import { Avatar, EdgeScrim, GlyphBox, Rail, RailButton, feedText } from "./shared";

const RAIL_ICON = "2.5em";
const COUNT = "1.05em";
const RAIL_RIGHT = "3%";
const RAIL_BOTTOM = "13%";
const RAIL_GAP = "1.2em";
const X_BLUE = "#1D9BF0";

/** X immersive video: back/"Video" header, outline rail, name + handle caption. */
export function XChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<EdgeScrim edge="top" size="16%" alpha={0.3} />
			<EdgeScrim edge="bottom" size="38%" alpha={0.42} />
			<TopBar zone={zone} />
			<Rail right={RAIL_RIGHT} bottom={RAIL_BOTTOM} gap={RAIL_GAP}>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<CommentOutline />
						</GlyphBox>
					}
					label="42"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<Repost />
						</GlyphBox>
					}
					label="128"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<HeartOutline />
						</GlyphBox>
					}
					label="2.3K"
					labelSize={COUNT}
				/>
				<RailButton
					icon={
						<GlyphBox size={RAIL_ICON}>
							<ViewBars />
						</GlyphBox>
					}
					label="58K"
					labelSize={COUNT}
				/>
				<GlyphBox size={RAIL_ICON}>
					<ShareUp />
				</GlyphBox>
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
				top: "calc(var(--safe-top, 0px) + 3.6%)",
				left: `${zone.left * 100}%`,
				right: "4%",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.7em" }}>
				<GlyphBox size="1.8em">
					<BackChevron />
				</GlyphBox>
				<span style={feedText({ size: "1.5em", weight: 700 })}>Video</span>
			</div>
			<GlyphBox size="1.5em">
				<BrandMark path={siX.path} color="#fff" />
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
				gap: "0.55em",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<Avatar size="2.3em" ringWidth="0.1em" />
				<span style={feedText({ size: "1.25em", weight: 700 })}>Your Name</span>
				<GlyphBox size="1.15em" shadow={false}>
					<VerifiedBadge fill={X_BLUE} />
				</GlyphBox>
				<span style={feedText({ size: "1.15em", weight: 500, dim: true })}>@yourhandle</span>
			</div>
			<span style={{ ...feedText({ size: "1.2em", weight: 500 }), whiteSpace: "normal" }}>
				Building this in TypeScript. Here is the walkthrough.
			</span>
		</div>
	);
}
