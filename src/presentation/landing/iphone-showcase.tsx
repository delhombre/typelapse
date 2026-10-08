import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import type { SocialPlatform } from "@/application/social/safe-zones";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { SocialChrome } from "@/presentation/components/preview/social-chrome";
import { SANS } from "@/presentation/components/preview/social-chrome/shared";
import { trigger } from "@/presentation/haptics";
import { motion, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import { DeviceFrame } from "./device-frame";
import { screenPlacement } from "./screen-switch";
import { StaticFrame } from "./static-frame";

/**
 * The hero of the social section: a realistic iPhone whose screen switches
 * between social feeds when the visitor picks a platform or swipes the device.
 * Switching apps slides horizontally — the current app leaves to the left while the
 * next enters from the right, the way you swipe between apps, not the vertical feed
 * scroll that would read as the next video in the same app — while the bezel and
 * Dynamic Island stay put. Every feed is mounted for the life of the page and
 * only its transform changes, so a switch composites layers that were already
 * rastered instead of painting a new screen mid-spring (see `ScreenSwitcher`).
 * Reduced motion keeps the selected feed and drops travel between platforms.
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
    non-empty tuple, so index 0 is always a defined fallback for the cycle.

    One order, one owner: this array is it. The chip row is an indicator of this
    cycle, so it renders `CYCLE_PLATFORMS` rather than keeping a running order of
    its own — two hand-aligned lists are two lists that can disagree, and the
    disagreement shows up as a chip lit for a feed that is not on screen.

    The order is the one the section's sentence names them in (TikTok, Reels,
    Shorts, X, LinkedIn), so the row reads as the line above it. */
export const SCREEN_CONFIGS = [
	{
		platform: "tiktok",
		themeName: "dracula",
		presetId: "nebula",
		title: "api/users.ts",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		meshTime: 5,
	},
	{
		platform: "reels",
		themeName: "aurora",
		presetId: "solar",
		title: "api/users.ts",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		meshTime: 9,
	},
	{
		platform: "shorts",
		themeName: "one-dark",
		presetId: "ocean",
		title: "api/users.ts",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		meshTime: 13,
	},
	{
		platform: "x",
		themeName: "nord",
		presetId: "ember",
		title: "api/users.ts",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		meshTime: 17,
	},
	{
		platform: "linkedin",
		themeName: "catppuccin",
		presetId: "forest",
		title: "api/users.ts",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		meshTime: 21,
	},
] as const satisfies readonly ScreenConfig[];

/** The platforms in the cycle, in the cycle's order: what the chip row renders,
    so a chip's position and a screen's position are the same fact. */
export const CYCLE_PLATFORMS: readonly SocialPlatform[] = SCREEN_CONFIGS.map((c) => c.platform);

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
   published curve. What has to be right is the shape — leaves fast, decelerates
   long, arrives without a bounce — and the values below are tuned until the
   three properties above read as one movement instead of three. */
const SWITCH_GAP = 6;
const SWITCH_SCALE = 0.94;
/* A released flick settles in well under half a second. Spring rather than a
   curve so an interrupted cycle lands somewhere sensible instead of snapping. */
const SWIPE_TRANSITION = { type: "spring", bounce: 0, duration: 0.44 } as const;
/* Used for the offscreen repositioning the ring needs on each wrap: both ends of
   that move are out of sight, so it must land in one frame, not travel. */
const INSTANT_TRANSITION = { duration: 0 } as const;

export interface CycleControls {
	/** Move one platform, the way the hand sent it. */
	step: (direction: 1 | -1) => void;
	/** Go straight to a platform, the way the chip row asks for it. The row is a
	    spatial map of the cycle, so a chip further along arrives from that side. */
	select: (index: number) => void;
}

export interface PlatformCycle {
	index: number;
	platform: SocialPlatform;
	/** Which way the last move went, so the ring knows which side to leave by. */
	direction: 1 | -1;
	controls: CycleControls;
}

/**
 * One selected platform shared by the chip row and phone. There is deliberately
 * no timer: the page demonstrates motion when someone asks for it.
 */
export function usePlatformCycle(): PlatformCycle {
	const [index, setIndex] = useState(0);
	const [direction, setDirection] = useState<1 | -1>(1);
	/* `select` has to know where the cycle is standing to work out which side the
	   next screen comes in from, and it must do that without making the controls
	   object a new one on every turn of the ring. */
	const indexRef = useRef(index);
	indexRef.current = index;

	const controls = useMemo<CycleControls>(
		() => ({
			step: (d) => {
				setDirection(d);
				setIndex((i) => (i + d + SCREEN_CONFIGS.length) % SCREEN_CONFIGS.length);
			},
			select: (target) => {
				if (!Number.isInteger(target) || target < 0 || target >= SCREEN_CONFIGS.length) {
					return;
				}
				const from = indexRef.current;
				if (from === target) {
					return;
				}
				setDirection(target > from ? 1 : -1);
				setIndex(target);
			},
		}),
		[],
	);

	return {
		index,
		platform: (SCREEN_CONFIGS[index] ?? SCREEN_CONFIGS[0]).platform,
		direction,
		controls,
	};
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

/**
 * All five feeds, mounted once and never unmounted, laid out on one ring: only
 * transforms change between switches.
 *
 * Mounting the arriving feed *during* the swipe was the whole cost of the
 * gesture — a mesh gradient, a grain blend and a fresh Shiki highlight all had
 * to be painted and rastered on the first frame of the spring, and the screen
 * was thrown away again straight after, so every 3.6s pass paid it anew. Kept
 * mounted, each screen is rastered once and a switch is pure composition:
 * `will-change: transform` asks the compositor to keep those layers around.
 *
 * The screens off the ring stay painted rather than hidden — `visibility:
 * hidden` would drop exactly the raster we are trying to keep — so they are held
 * offscreen by their own transform and clipped by the device's screen well.
 * `inert` keeps them out of tab order and off the pointer; the well itself is
 * already `aria-hidden`, so no screen reader sees them either.
 */
function ScreenSwitcher({ activeIndex, direction }: { activeIndex: number; direction: 1 | -1 }) {
	return (
		<>
			{SCREEN_CONFIGS.map((config, index) => {
				const placement = screenPlacement({
					index,
					activeIndex,
					direction,
					count: SCREEN_CONFIGS.length,
					gap: SWITCH_GAP,
					offscreenScale: SWITCH_SCALE,
				});
				return (
					<motion.div
						key={config.platform}
						className="absolute inset-0"
						style={{ willChange: "transform" }}
						inert={index !== activeIndex}
						initial={false}
						/* One `transform`, not `x` and `scale`. The shorthands are separate
						   motion values that have to be composed into a transform string on
						   the main thread every frame; written whole, the animation is a
						   single property the browser can take off our hands. `placement.x`
						   carries its own unit — it is a percentage of the screen's width,
						   which is what makes the ring independent of the device size. */
						animate={{
							transform: `translateX(${placement.x}) scale(${placement.scale})`,
						}}
						transition={placement.animated ? SWIPE_TRANSITION : INSTANT_TRANSITION}
					>
						<SocialScreen config={config} />
					</motion.div>
				);
			})}
		</>
	);
}

/* A flick is a statement of intent, not a measurement: past this speed the
   distance stops mattering, because a fast short push is exactly how someone
   says "next" without meaning to travel. Pixels per millisecond. */
const FLICK_VELOCITY = 0.11;
/* And below that speed, the ordinary rule: carry it more than a third of the way
   and it goes, otherwise it comes back. */
const COMMIT_FRACTION = 0.3;

interface DragState {
	pointerId: number;
	startX: number;
	startedAt: number;
	/**
	 * Where the ring was when the hand actually started moving it — read at the
	 * first move, not at the touch. A settling ring keeps travelling in the gap
	 * between the two, and an origin taken at the touch is already stale by the
	 * time it is used: the first move would snap the ring by however far it got.
	 * Taken at the first move instead, the drag begins from wherever it is.
	 */
	base: number | null;
	width: number;
	lastX: number;
}

interface IphoneShowcaseProps {
	/** The cycle this is a view of: index, direction and the controls the hand needs. */
	cycle: PlatformCycle;
	className?: string;
}

/**
 * The phone reads as something you can swipe, so it has to be. The screen is a
 * carousel with a home-bar gesture; offering that shape and answering only to a
 * timer is the interface telling a small lie.
 *
 * The drag moves the whole ring rather than each screen, on one transform, in
 * the same percent-of-screen-width unit the placements use — so the gesture and
 * the timer drive the same machine and a released swipe settles on the same
 * spring an automatic one does.
 */
export function IphoneShowcase({ cycle, className = "" }: IphoneShowcaseProps) {
	const reduce = useReducedMotion();
	const { index: activeIndex, direction, controls } = cycle;
	const config: ScreenConfig = SCREEN_CONFIGS[activeIndex] ?? SCREEN_CONFIGS[0];

	const surface = useRef<HTMLDivElement | null>(null);
	const drag = useRef<DragState | null>(null);
	const [offset, setOffset] = useState(0);
	const [dragging, setDragging] = useState(false);

	/** Where the ring is *now*, mid-spring included — the baseline a new grab
	    starts from, so an interrupted settle is retargeted and never restarted. */
	const currentOffset = () => {
		const node = surface.current;
		if (!node) {
			return 0;
		}
		const width = node.getBoundingClientRect().width || 1;
		return (new DOMMatrix(getComputedStyle(node).transform).e / width) * 100;
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		/* One hand at a time: a second finger landing mid-drag would otherwise
		   redefine the origin and the ring would jump to meet it. */
		if (drag.current) {
			return;
		}
		const node = event.currentTarget;
		drag.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startedAt: performance.now(),
			base: null,
			width: node.getBoundingClientRect().width || 1,
			lastX: event.clientX,
		};
		node.setPointerCapture(event.pointerId);
		setDragging(true);
		/* Catch it where it is: putting a hand on a moving ring stops it, rather
		   than letting it coast to rest underneath. */
		setOffset(currentOffset());
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = drag.current;
		if (!state || state.pointerId !== event.pointerId) {
			return;
		}
		state.lastX = event.clientX;
		/* Reduced motion still takes the gesture — a swipe is the visitor's own
		   movement, not the page's — but it does not follow the finger. The
		   decision is still measured; only the travel is dropped. */
		if (reduce) {
			return;
		}
		if (state.base === null) {
			/* Anchored so that this very move lands exactly where the ring already
			   is: the origin is solved backwards from the current position rather
			   than moved to the pointer. Moving the origin instead would be the
			   easy version and would silently eat this move's distance — which is
			   the whole gesture when the browser coalesces a fast swipe into one
			   event. */
			state.base = currentOffset() - ((event.clientX - state.startX) / state.width) * 100;
		}
		setOffset(state.base + ((event.clientX - state.startX) / state.width) * 100);
	};

	/**
	 * Everything the end of a drag owes regardless of how it ended: the hand
	 * comes off, the ring goes back to rest, the clock is handed back. Returns
	 * the drag that ended, so only the caller who can decide anything decides
	 * it, or null when the event belongs to some other pointer.
	 */
	const endDrag = (event: ReactPointerEvent<HTMLDivElement>): DragState | null => {
		const state = drag.current;
		if (!state || state.pointerId !== event.pointerId) {
			return null;
		}
		drag.current = null;
		setDragging(false);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setOffset(0);
		return state;
	};

	/**
	 * A cancel is the browser taking the gesture away mid-drag — `touch-action:
	 * pan-y` handing the finger to the page's own scroll, a system edge gesture
	 * winning, the window losing focus. Nobody let go of anything, so nothing is
	 * decided: the ring springs back to where it started, the cycle keeps its
	 * index, and the hand feels nothing. A buzz here would be the page claiming
	 * credit for a swipe that never happened, on the one gesture the visitor did
	 * not finish.
	 */
	const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
		endDrag(event);
	};

	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = endDrag(event);
		if (!state) {
			return;
		}

		const travelled = state.lastX - state.startX;
		const elapsed = Math.max(1, performance.now() - state.startedAt);
		const flicked = Math.abs(travelled) / elapsed > FLICK_VELOCITY;
		const carried = Math.abs(travelled) > state.width * COMMIT_FRACTION;
		if (travelled !== 0 && (flicked || carried)) {
			controls.step(travelled < 0 ? 1 : -1);
			/* The swipe took: the same moment the ring commits, the hand feels it.
			   A bounce-back stays silent, and the timer never reaches this branch. */
			trigger("light");
		}
	};

	/* Reduced motion never cycles, so it mounts the one feed it will ever show. */
	const screen = (
		<motion.div
			ref={surface}
			className="absolute inset-0"
			style={{ touchAction: "pan-y", userSelect: "none" }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
			initial={false}
			animate={{ transform: `translateX(${offset}%)` }}
			transition={dragging ? INSTANT_TRANSITION : SWIPE_TRANSITION}
		>
			{reduce ? (
				<SocialScreen config={config} />
			) : (
				<ScreenSwitcher activeIndex={activeIndex} direction={direction} />
			)}
		</motion.div>
	);

	const device = (
		<DeviceFrame
			ariaLabel="An interactive iPhone preview of social feeds showing a Typelapse code video"
			className={className}
		>
			{screen}
		</DeviceFrame>
	);

	return <div className="flex w-full justify-center">{device}</div>;
}
