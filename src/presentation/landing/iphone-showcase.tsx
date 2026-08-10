import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import type { SocialPlatform } from "@/application/social/safe-zones";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { SocialChrome } from "@/presentation/components/preview/social-chrome";
import { SANS } from "@/presentation/components/preview/social-chrome/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import { DeviceFrame } from "./device-frame";
import { StaticFrame } from "./static-frame";

/**
 * The hero of the social section: a realistic iPhone whose screen auto-cycles
 * through TikTok, Reels and Shorts feeds, each showing one of our code exports.
 * Switching apps slides horizontally — the current app leaves to the left while the
 * next enters from the right, the way you swipe between apps, not the vertical feed
 * scroll that would read as the next video in the same app — while the bezel and
 * Dynamic Island stay put. Reduced motion drops the cycle and float for one feed.
 */

interface ScreenConfig {
	platform: SocialPlatform;
	themeName: string;
	presetId: string;
	title: string;
	code: string;
	meshTime: number;
}

/** The cycle, in order. One faithful feed + one code export per platform. A
    non-empty tuple, so index 0 is always a defined fallback for the cycle. */
export const SCREEN_CONFIGS = [
	{
		platform: "tiktok",
		themeName: "dracula",
		presetId: "nebula",
		title: "app.ts",
		code: "app.boot()\napp.run()",
		meshTime: 5,
	},
	{
		platform: "reels",
		themeName: "aurora",
		presetId: "aurora",
		title: "ship.ts",
		code: "function ship() {\n  launch()\n}",
		meshTime: 9,
	},
	{
		platform: "shorts",
		themeName: "one-dark",
		presetId: "ocean",
		title: "queue.ts",
		code: "queue.push(job)\nqueue.flush()",
		meshTime: 13,
	},
	{
		platform: "x",
		themeName: "nord",
		presetId: "ember",
		title: "post.ts",
		code: "const thread = compose()\nthread.ship()",
		meshTime: 17,
	},
	{
		platform: "linkedin",
		themeName: "catppuccin",
		presetId: "forest",
		title: "share.ts",
		code: "const reach = publish()\nreach.grow()",
		meshTime: 21,
	},
] as const satisfies readonly ScreenConfig[];

/** The platforms in the cycle, so the section can dim any chip that is not shown. */
export const CYCLE_PLATFORMS: readonly SocialPlatform[] = SCREEN_CONFIGS.map((c) => c.platform);

/** How long each feed holds before swiping to the next. */
const HOLD_MS = 3600;

/* The iOS home-bar app switch, rebuilt from what the gesture actually does.
   The screen was cross-sliding like a web carousel, which reads as one filmstrip
   scrolling past a window. Three things separate the device's gesture from that,
   and the page was doing none of them.

   1. The apps never fade. Opacity is the carousel tell; on the device the app
      leaving stays at full strength right up to the edge and you simply stop
      seeing it.
   2. There is a gap between them. You see the surface behind, which is what
      makes two apps read as two cards rather than as one continuous strip.
   3. They lift. Both are scaled down while they travel and settle back, which is
      the entire reason the gesture feels physical rather than mechanical.

   Reconstructed from the gesture's observable behaviour rather than from a
   published Apple curve: the values below are ours, the shape is theirs. */
const SWITCH_GAP = 6;
const SWITCH_SCALE = 0.94;
/* A released flick settles in well under half a second. Spring rather than a
   curve so an interrupted cycle lands somewhere sensible instead of snapping. */
const SWIPE_TRANSITION = { type: "spring", bounce: 0, duration: 0.44 } as const;

/**
 * Drive the cycle index on a timed loop. Reduced motion pins it to the first
 * config (a static feed) and never starts the interval. The active platform is
 * derived from the returned index, so the chips and the screen share one source.
 */
export function usePlatformCycle(): { index: number; platform: SocialPlatform } {
	const reduce = useReducedMotion();
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (reduce) {
			return;
		}
		const id = window.setInterval(() => {
			setIndex((i) => (i + 1) % SCREEN_CONFIGS.length);
		}, HOLD_MS);
		return () => window.clearInterval(id);
	}, [reduce]);

	return { index, platform: (SCREEN_CONFIGS[index] ?? SCREEN_CONFIGS[0]).platform };
}

/**
 * One feed: the mesh export fills the screen full-bleed, the code window floats in
 * the centre, and the faithful in-feed chrome sizes off a `cqmin` root on top —
 * the same composition the studio preview and the export use, so this reads as a
 * real screenshot rather than a mockup.
 */
function SocialScreen({ config }: { config: ScreenConfig }) {
	const preset = MESH_PRESETS.find((p) => p.id === config.presetId) ?? MESH_PRESETS[0];
	return (
		<div className="absolute inset-0" style={{ containerType: "size" }}>
			<div
				className="absolute inset-0"
				style={{ background: preset ? meshGradientCss(preset, config.meshTime) : undefined }}
			/>
			<GrainOverlay />

			<div className="absolute inset-0 flex items-center justify-center">
				<div className="w-[72%]" style={{ transform: "translateY(-6%)" }}>
					<StaticFrame
						themeName={config.themeName}
						presetId={config.presetId}
						code={config.code}
						title={config.title}
						meshTime={config.meshTime}
						meshPadding={0}
						framePadding={13}
						fontSize={10.5}
						className="w-full lp-nogutter"
					/>
				</div>
			</div>

			{/* The feed chrome is full-bleed, so its top gradient scrim runs continuously
			    from the very top of the screen (no colour seam under the Dynamic Island).
			    Only the interactive top furniture is pushed down by `--safe-top` to clear
			    the island, like a real app honouring the status-bar safe area. */}
			<div
				className="absolute inset-0"
				style={{ fontSize: "2.7cqmin", fontFamily: SANS, "--safe-top": "44px" } as CSSProperties}
			>
				<SocialChrome platform={config.platform} />
			</div>
		</div>
	);
}

interface IphoneShowcaseProps {
	/** The currently-shown platform (from `usePlatformCycle`), which the screen keys on. */
	platform: SocialPlatform;
	className?: string;
}

export function IphoneShowcase({ platform, className = "" }: IphoneShowcaseProps) {
	const reduce = useReducedMotion();
	const config: ScreenConfig =
		SCREEN_CONFIGS.find((c) => c.platform === platform) ?? SCREEN_CONFIGS[0];

	const screen = reduce ? (
		<SocialScreen config={config} />
	) : (
		<AnimatePresence initial={false}>
			<motion.div
				key={config.platform}
				className="absolute inset-0"
				initial={{ x: `${100 + SWITCH_GAP}%`, scale: SWITCH_SCALE }}
				animate={{ x: "0%", scale: 1 }}
				exit={{ x: `${-100 - SWITCH_GAP}%`, scale: SWITCH_SCALE }}
				transition={SWIPE_TRANSITION}
			>
				<SocialScreen config={config} />
			</motion.div>
		</AnimatePresence>
	);

	const device = (
		<DeviceFrame
			ariaLabel="An iPhone cycling through TikTok, Instagram Reels and YouTube Shorts feeds showing Typelapse code snippets"
			className={className}
		>
			{screen}
		</DeviceFrame>
	);

	if (reduce) {
		return device;
	}

	// A slow, gentle float so the device feels alive, Apple-product-page style.
	return (
		<motion.div
			className="w-full"
			style={{ display: "flex", justifyContent: "center" }}
			animate={{ y: [0, -6, 0] }}
			transition={{ duration: 5, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
		>
			{device}
		</motion.div>
	);
}
