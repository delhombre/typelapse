import {
	type OccludedRegion,
	type SocialPlatform,
	occludedRegions,
} from "@/application/social/safe-zones";
import { type Transition, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, memo } from "react";
import { SocialChrome } from "./social-chrome";
import { SANS } from "./social-chrome/shared";

interface SocialPreviewOverlayProps {
	platform: SocialPlatform;
	showGuides: boolean;
	/** Corner radius of the aspect box, so scrims and labels never overhang it. */
	radius: number;
}

/**
 * A preview-only, high-fidelity recreation of a platform feed drawn over the
 * export ASPECT CANVAS (fractions of the full 9:16 / 1:1 / 4:5 box). Layer A is
 * the faithful in-feed chrome (per-platform components under ./social-chrome);
 * Layer B is the dimmed safe-zone guides that toggle on top. Both take their
 * geometry from the SAME safe-zone spec, so the chrome and the guides always
 * agree on the regions the platform UI occludes.
 *
 * A design aid, never captured by the PNG nor baked into the video: it lives
 * OUTSIDE [data-export-target], as a sibling of the card. Every size is a
 * `cqmin`-based `em`, so the whole mockup scales with the canvas. Memoized so
 * playback frames (which re-render the card) never re-render the furniture.
 */
export const SocialPreviewOverlay = memo(function SocialPreviewOverlay({
	platform,
	showGuides,
	radius,
}: SocialPreviewOverlayProps) {
	const reduce = useReducedMotion();
	const hidden = reduce ? { opacity: 0 } : { opacity: 0, scale: 1.015 };
	const shown = { opacity: 1, scale: 1 };
	const appear: Transition = reduce
		? { duration: 0 }
		: { type: "spring", bounce: 0, duration: 0.45 };
	const swap: Transition = reduce ? { duration: 0 } : { duration: 0.28 };

	return (
		<motion.div
			aria-hidden
			className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
			style={{ borderRadius: radius, containerType: "size" }}
			initial={hidden}
			animate={shown}
			exit={hidden}
			transition={appear}
		>
			{/* Swap the chrome + guides when the platform changes. A keyed fade-in
			    (NOT AnimatePresence mode="wait", which deadlocks here: the exiting
			    child never completes, freezing the chrome on the first platform)
			    keeps the switch instant and reliable. The container-query root above
			    keeps cqmin stable through the swap. */}
			<motion.div
				key={platform}
				className="absolute inset-0"
				style={{ fontSize: "2.7cqmin", fontFamily: SANS }}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={swap}
			>
				<SocialChrome platform={platform} />
				{showGuides && <SafeZoneGuides regions={occludedRegions(platform)} />}
			</motion.div>
		</motion.div>
	);
});

/* ──────────── Layer B: safe-zone guides ──────────── */

function SafeZoneGuides({ regions }: { regions: readonly OccludedRegion[] }) {
	return (
		<>
			{regions.map((region) => (
				<GuideBand key={region.edge} region={region} />
			))}
		</>
	);
}

function GuideBand({ region }: { region: OccludedRegion }) {
	const { edge, fraction, label } = region;
	const size = `${fraction * 100}%`;
	const vertical = edge === "left" || edge === "right";
	const style: CSSProperties = {
		position: "absolute",
		background: "rgba(0,0,0,0.28)",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	};
	if (edge === "top") {
		Object.assign(style, { top: 0, left: 0, right: 0, height: size, borderBottom: HAIRLINE });
	}
	if (edge === "bottom") {
		Object.assign(style, { bottom: 0, left: 0, right: 0, height: size, borderTop: HAIRLINE });
	}
	if (edge === "left") {
		Object.assign(style, { top: 0, bottom: 0, left: 0, width: size, borderRight: HAIRLINE });
	}
	if (edge === "right") {
		Object.assign(style, { top: 0, bottom: 0, right: 0, width: size, borderLeft: HAIRLINE });
	}
	return (
		<div style={style}>
			<span
				style={{
					// Floor keeps the label legible even when the aspect box is small.
					fontSize: "max(10px, 0.9em)",
					fontWeight: 600,
					letterSpacing: "0.03em",
					color: "rgba(255,255,255,0.92)",
					textShadow: "0 0.05em 0.16em rgba(0,0,0,0.65)",
					writingMode: vertical ? "vertical-rl" : "horizontal-tb",
					whiteSpace: "nowrap",
					padding: "0.3em",
				}}
			>
				{label}
			</span>
		</div>
	);
}

const HAIRLINE = "1px solid rgba(255,255,255,0.35)";
