import type { SafeZone } from "@/application/social/safe-zones";
import type { ReactNode } from "react";
import { CommentOutline, HeartSolid, LinkedInMark, PaperPlane, Repost, ThumbUp } from "./icons";
import { Avatar, GlyphBox, ReactionCoin } from "./shared";

/* LinkedIn is a light feed CARD, not an immersive video: white header + footer
   panels frame the export canvas (the "media"), so text is dark, not shadowed. */
const CARD_BG = "rgba(255,255,255,0.97)";
const TEXT = "#1f2328";
const SUBTLE = "#5f6b7a";
const LINKEDIN_BLUE = "#0A66C2";
const HAIRLINE = "1px solid rgba(0,0,0,0.1)";

/** LinkedIn in-feed card: author header + reactions/actions footer over the video. */
export function LinkedInChrome({ zone }: { zone: SafeZone }) {
	return (
		<>
			<Header zone={zone} />
			<Footer zone={zone} />
		</>
	);
}

function Header({ zone }: { zone: SafeZone }) {
	return (
		<div
			style={{
				position: "absolute",
				top: "var(--safe-top, 0px)",
				left: 0,
				right: 0,
				background: CARD_BG,
				borderBottom: HAIRLINE,
				padding: `${zone.top * 100 + 1.5}% ${zone.left * 100 + 2}% 3.5%`,
				display: "flex",
				alignItems: "flex-start",
				gap: "0.8em",
				fontFamily: "inherit",
			}}
		>
			<Avatar size="3.4em" ringColor="transparent" ringWidth="0" />
			<div style={{ display: "flex", flexDirection: "column", gap: "0.2em", flex: 1, minWidth: 0 }}>
				<span style={{ fontSize: "1.3em", fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>
					Your Name <span style={{ color: SUBTLE, fontWeight: 400 }}>· 1st</span>
				</span>
				<span style={{ fontSize: "1.05em", color: SUBTLE, lineHeight: 1.25 }}>
					Software Engineer, building in public
				</span>
				<span style={{ fontSize: "1em", color: SUBTLE, lineHeight: 1.2 }}>2h · Edited</span>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: "0.8em" }}>
				<span
					style={{ fontSize: "1.2em", fontWeight: 700, color: LINKEDIN_BLUE, whiteSpace: "nowrap" }}
				>
					+ Follow
				</span>
				<GlyphBox size="1.9em" color={LINKEDIN_BLUE} shadow={false}>
					<LinkedInMark />
				</GlyphBox>
			</div>
		</div>
	);
}

function Footer({ zone }: { zone: SafeZone }) {
	return (
		<div
			style={{
				position: "absolute",
				bottom: 0,
				left: 0,
				right: 0,
				background: CARD_BG,
				borderTop: HAIRLINE,
				padding: `3.5% ${zone.left * 100 + 2}% 4%`,
				display: "flex",
				flexDirection: "column",
				gap: "0.9em",
				fontFamily: "inherit",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
				<div style={{ display: "flex", alignItems: "center" }}>
					<ReactionCoin size="1.7em" background={LINKEDIN_BLUE}>
						<FilledThumb />
					</ReactionCoin>
					<span style={{ marginLeft: "-0.45em" }}>
						<ReactionCoin size="1.7em" background="#6DAE4F">
							<FilledStar />
						</ReactionCoin>
					</span>
					<span style={{ marginLeft: "-0.45em" }}>
						<ReactionCoin size="1.7em" background="#DF704D">
							<HeartSolid />
						</ReactionCoin>
					</span>
				</div>
				<span style={{ fontSize: "1.05em", color: SUBTLE }}>128 · 14 comments</span>
			</div>
			<div style={{ height: 1, background: "rgba(0,0,0,0.08)" }} />
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<Action icon={<ThumbUp stroke={1.9} />} label="Like" />
				<Action icon={<CommentOutline stroke={1.9} />} label="Comment" />
				<Action icon={<Repost stroke={1.9} />} label="Repost" />
				<Action icon={<PaperPlane stroke={1.9} />} label="Send" />
			</div>
		</div>
	);
}

function Action({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "0.4em", color: SUBTLE }}>
			<GlyphBox size="1.7em" color={SUBTLE} shadow={false}>
				{icon}
			</GlyphBox>
			<span style={{ fontSize: "1.1em", fontWeight: 600, color: SUBTLE }}>{label}</span>
		</div>
	);
}

/* Small filled glyphs for the reaction coins (white on colored circles). */

function FilledThumb() {
	return (
		<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
			<path d="M2 10.5h3.2V21H2zM7 10.2l3.7-7.4c1.1.05 1.9.95 1.9 2v3.3h5a1.6 1.6 0 0 1 1.58 1.9l-1.1 6.5A1.6 1.6 0 0 1 17.5 21H7z" />
		</svg>
	);
}

function FilledStar() {
	return (
		<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
			<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9 6.7 19.3l1.1-5.9L3.5 9.2l5.9-.8z" />
		</svg>
	);
}
