import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import {
	type RenderToken,
	easeInOutCubic,
	renderStatic,
	renderTransition,
} from "@/application/magic-move/engine";
import { buildTimeline, locate } from "@/application/magic-move/timeline";
import { Theme } from "@/domain/entities/theme";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { useInViewPlayback } from "@/presentation/hooks/use-in-view-playback";
import { useResizeObserver } from "@/presentation/hooks/use-resize-observer";
import { springs } from "@/presentation/motion";
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Link } from "react-router-dom";
import { BackGlyph, PauseGlyph, PlayGlyph } from "./island-icons";

/* The instrument runs the real product parts: the same three-step `api/users.ts`
   demo, tokenized by Shiki, keyed + morphed by the shared magic-move engine, and
   painted by the shared MagicMoveCanvas, so it looks exactly like the export. */

const THEMES: Record<string, () => Theme> = {
	midnight: Theme.midnight,
	aurora: Theme.aurora,
	frost: Theme.frost,
	dracula: Theme.dracula,
	"one-dark": Theme.oneDark,
	catppuccin: Theme.catppuccin,
	nord: Theme.nord,
};

/**
 * Theme chips: the theme's own background plus two of its syntax colours, so
 * the control is a miniature of the theme rather than a label for it. Taken
 * from each palette's keyword and string hues, which are what a viewer
 * actually recognises a theme by.
 */
const THEME_DOTS: { name: string; bg: string; a: string; b: string }[] = [
	{ name: "midnight", bg: "#0d1117", a: "#79c0ff", b: "#7ee787" },
	{ name: "aurora", bg: "#1a1b2e", a: "#c4b5fd", b: "#6ee7b7" },
	{ name: "frost", bg: "#f0f4f8", a: "#2563eb", b: "#047857" },
	{ name: "dracula", bg: "#282a36", a: "#ff79c6", b: "#50fa7b" },
	{ name: "one-dark", bg: "#282c34", a: "#c678dd", b: "#98c379" },
	{ name: "catppuccin", bg: "#1e1e2e", a: "#cba6f7", b: "#a6e3a1" },
	{ name: "nord", bg: "#2e3440", a: "#88c0d0", b: "#a3be8c" },
];

/** One stage, and three ratios fitted inside it.
    The aspects used to carry their own sizes, from 358px tall at 16:9 to 448px
    at 9:16, so cycling the ratio grew the frame and pushed the dock, the caption
    and the whole page below it down by up to 90px. A Lapse take named it:
    `div in 'Live preview…' animates height (layout)`. The stage is now a
    constant box the frame is fitted into, so the ratio changes what you see
    without moving anything around it. Kept compact so the whole hero (headline,
    subhead, this object, toolbar) still fits within the first viewport.

    `h` is the frame's box, not the stage's: the stage keeps a strip below it
    (`--helper-lane`) that the frame never enters, which is where the helper
    opens. Carving that strip out of the stage rather than adding it under the
    dock is what lets the helper sit above the island without either covering the
    preview or costing the hero a pixel. */
const STAGE = { w: 636, h: 366 } as const;

const ASPECTS = [
	{ id: "16:9", ratio: 16 / 9 },
	{ id: "1:1", ratio: 1 },
	{ id: "9:16", ratio: 9 / 16 },
] as const;

type AspectId = (typeof ASPECTS)[number]["id"];

/** Largest box of this ratio that fits the stage: wide ratios are bound by its
    width and letterbox vertically, tall ones fill its height. */
const fitToStage = (ratio: number) => {
	const w = Math.min(STAGE.w, STAGE.h * ratio);
	return { w, h: w / ratio };
};

const DEMO_FRAMES = [
	`export async function GET(req) {
  const users = await db.users.all()
}`,
	`export async function GET(req) {
  const users = await db.users.all()
  return Response.json(users)
}`,
	`export async function GET(req) {
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  return Response.json(active)
}`,
];
/** Append the first frame so the loop morphs back instead of hard-cutting. */
const LOOP_CODES = [...DEMO_FRAMES, DEMO_FRAMES[0] ?? ""];
const HOLDS = [1300, 1500, 2200, 800];

const MESH_PAD = 12;
/** Restrained, Tuple-like corner radii: a crisp inner window with a mesh frame
    that is exactly concentric with it (outer = inner + the mesh padding). */
const WINDOW_RADIUS = 6;
const WINDOW_WIDTH = 452;
const WINDOW_FONT = 13;
const FRAME_PADDING = 18;
const LINE_HEIGHT_RATIO = 1.6;
/** Natural window footprint (its tallest, 5-line state): used to fit + centre it. */
const NATURAL_W = WINDOW_WIDTH;
const NATURAL_H = 184;
/** A pleasant frozen moment for the mesh when paused before playback starts. */
const MESH_IDLE_T = 3;
const OBJECT_SHADOW = "0 30px 80px -24px rgb(0 0 0 / 0.25), 0 2px 8px rgb(0 0 0 / 0.06)";

interface DemoView {
	tokens: RenderToken[];
	lineCount: number;
	lineNumberCount: number;
}

/** Resolve the tokens to paint at a playback position (static hold or live morph). */
function resolveView(plan: MagicMovePlan, pos: ReturnType<typeof locate>): DemoView {
	if (pos.phase === "transition") {
		const transition = plan.transitions[pos.index];
		const from = plan.frames[pos.index];
		const to = plan.frames[pos.index + 1];
		if (transition && from && to) {
			const eased = easeInOutCubic(pos.t);
			return {
				tokens: renderTransition(transition.from, transition.to, pos.t),
				lineCount: from.lineCount + (to.lineCount - from.lineCount) * eased,
				lineNumberCount: Math.max(from.lineCount, to.lineCount),
			};
		}
	}
	const frame = plan.frames[pos.index] ?? plan.frames[0];
	if (!frame) {
		return { tokens: [], lineCount: 1, lineNumberCount: 1 };
	}
	return {
		tokens: renderStatic(frame.tokens),
		lineCount: frame.lineCount,
		lineNumberCount: frame.lineCount,
	};
}

/**
 * The heart of the page: a single, live, playable frame. It loops the real
 * magic-move engine over the `api/users.ts` demo on an animated mesh backdrop,
 * and a floating toolbar restyles it: play/pause, five mesh backgrounds, seven
 * themes, three aspects. Everything below the frame just tunes this one object.
 */
export function Instrument({
	maxScale = 1,
	onPresetChange: reportPreset,
}: {
	maxScale?: number;
	/** Reports the live backdrop outward, for a composition that wants to take
	    its own colour from whatever the visitor picked. */
	onPresetChange?: (id: string) => void;
} = {}) {
	const reduce = useReducedMotion();
	const [themeName, setThemeName] = useState("aurora");
	const [presetId, setPresetId] = useState("solar");
	const [aspect, setAspect] = useState<AspectId>("16:9");
	const [playing, setPlaying] = useState(!reduce);
	const [view, setView] = useState<DemoView | null>(null);
	const [plan, setPlan] = useState<{
		plan: MagicMovePlan;
		timeline: ReturnType<typeof buildTimeline>;
	} | null>(null);

	const theme = useMemo(() => (THEMES[themeName] ?? Theme.aurora)(), [themeName]);
	const preset = useMemo(
		() => MESH_PRESETS.find((p) => p.id === presetId) ?? MESH_PRESETS[0],
		[presetId],
	);

	// Live values the rAF loop reads without restarting: the current preset, the
	// elapsed clock (frozen when paused) and the mesh clock.
	const presetRef = useRef(preset);
	presetRef.current = preset;
	const elapsedRef = useRef(0);
	const meshTRef = useRef(MESH_IDLE_T);
	const initedRef = useRef(false);
	const meshRef = useRef<HTMLDivElement>(null);

	// Responsive fit: measure the available width and shrink the whole stage so it
	// never overflows a phone. The stage scales, never the ratio inside it, so the
	// frame keeps its proportions at every width.
	const wrapperRef = useRef<HTMLDivElement>(null);
	const resize = useResizeObserver(wrapperRef);
	// Playback is suspended while the stage is off screen: the loop repaints a
	// 636×366 gradient layer every frame, and a visitor reading the sections below
	// pays for it in dropped frames without ever seeing it.
	const { ref: observeStage, inView } = useInViewPlayback<HTMLDivElement>();
	const setStage = useCallback(
		(node: HTMLDivElement | null) => {
			wrapperRef.current = node;
			observeStage(node);
		},
		[observeStage],
	);
	const current = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
	const target = fitToStage(current.ratio);
	// Both axes: the stage's rendered height comes from CSS (it shrinks on a short
	// viewport), so the frame has to answer to it as well as to the width.
	const availW = resize?.contentRect?.width;
	const availH = resize?.contentRect?.height;
	// `maxScale` is how far past its natural size the frame may grow when a
	// composition gives it more room than it needs. 1 everywhere the hero puts
	// copy around it; a hero that hands the instrument the whole viewport raises
	// it, which is a composition decision rather than a component one.
	const fitScale = Math.min(
		maxScale,
		availW ? availW / STAGE.w : maxScale,
		availH ? availH / STAGE.h : maxScale,
	);

	const meshW = useSpring(target.w * fitScale, springs.gentle);
	const meshH = useSpring(target.h * fitScale, springs.gentle);
	// Depends on the two numbers, not on `target`: it is a fresh object every
	// render, and depending on it would re-set the springs on every render.
	useEffect(() => {
		const w = target.w * fitScale;
		const h = target.h * fitScale;
		if (reduce) {
			meshW.jump(w);
			meshH.jump(h);
			return;
		}
		meshW.set(w);
		meshH.set(h);
	}, [target.w, target.h, fitScale, reduce, meshW, meshH]);

	// The code window keeps its natural size and centres in the mesh, scaling down
	// only when the current aspect is too narrow to hold it (9:16, or on mobile).
	const windowScale = useTransform([meshW, meshH], ([w, h]: number[]) => {
		const s = Math.min(
			1,
			((w ?? 0) - MESH_PAD * 2) / NATURAL_W,
			((h ?? 0) - MESH_PAD * 2) / NATURAL_H,
		);
		return Math.max(0.1, s);
	});

	// Build the engine plan for the active theme (retokenizes on theme change).
	useEffect(() => {
		let cancelled = false;
		const p0 = presetRef.current;
		if (meshRef.current && p0) {
			meshRef.current.style.background = meshGradientCss(p0, meshTRef.current);
		}
		shikiAdapter
			.getRawHighlighter()
			.then((h) => {
				if (cancelled) {
					return;
				}
				const built = buildMagicMovePlan(h, LOOP_CODES, "typescript", theme.name, false);
				const timeline = buildTimeline(HOLDS);
				// Reduced motion mounts on the finished frame, not mid-loop.
				if (reduce && !initedRef.current) {
					const hold = timeline.segments.find(
						(s) => s.type === "hold" && s.index === DEMO_FRAMES.length - 1,
					);
					if (hold) {
						elapsedRef.current = hold.startMs + (hold.endMs - hold.startMs) / 2;
					}
				}
				initedRef.current = true;
				setPlan({ plan: built, timeline });
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [theme.name, reduce]);

	/** Paused by the visitor, or suspended because the stage is off screen. The
	    two are deliberately one state here and two states outside: whoever paused
	    stays paused, and a playing instrument that scrolls away resumes where it
	    left off rather than restarting. */
	const suspended = !playing || !inView;

	// Drive playback. While playing, advance the clock and drift the mesh; while
	// suspended, hold the exact morph position (the mesh freezes at its last moment).
	useEffect(() => {
		if (!plan) {
			return;
		}
		const { plan: built, timeline } = plan;
		if (suspended) {
			setView(resolveView(built, locate(timeline, elapsedRef.current)));
			return;
		}
		let raf = 0;
		let cancelled = false;
		let last = performance.now();
		const lastSig = { current: "" };
		const tick = (now: number) => {
			if (cancelled) {
				return;
			}
			const dt = now - last;
			last = now;
			elapsedRef.current = (elapsedRef.current + dt) % timeline.totalMs;
			const pos = locate(timeline, elapsedRef.current);
			const sig = `${pos.phase}:${pos.index}:${pos.phase === "transition" ? Math.round(pos.t * 60) : 0}`;
			if (sig !== lastSig.current) {
				lastSig.current = sig;
				setView(resolveView(built, pos));
			}
			// The mesh clock accumulates the same delta as the playback clock rather
			// than reading the absolute `now`: a suspended loop hands back a stale
			// `last`, and an absolute clock would jump the backdrop forward by the
			// whole time spent off screen the instant it came back into view.
			meshTRef.current += dt / 1000;
			const livePreset = presetRef.current;
			if (meshRef.current && livePreset) {
				meshRef.current.style.background = meshGradientCss(livePreset, meshTRef.current);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [plan, suspended]);

	// Recolour a suspended mesh when the background swatch changes (the rAF loop
	// owns the mesh while it runs). Painted at the frozen `meshTRef`, so the
	// backdrop changes colour without moving.
	useEffect(() => {
		if (!suspended || !preset) {
			return;
		}
		if (meshRef.current) {
			meshRef.current.style.background = meshGradientCss(preset, meshTRef.current);
		}
	}, [preset, suspended]);

	const bodyHeight = 5 * WINDOW_FONT * LINE_HEIGHT_RATIO;

	return (
		<section className="mx-auto w-full max-w-5xl px-6">
			{/* The stage: a box the frame is centred in, sized by CSS so it gives back
			    height on a short viewport instead of pushing the dock past the fold.
			    Its height is also what keeps the dock still while the ratio cycles. */}
			<div ref={setStage} className="lp-stage flex w-full items-center justify-center">
				<motion.div
					role="img"
					aria-label="Live preview: a code snippet morphing token by token on a mesh gradient background"
					style={{
						width: meshW,
						height: meshH,
						padding: MESH_PAD,
						// True concentric: outer radius = inner window radius + the mesh padding,
						// so the frame and window corners nest exactly.
						borderRadius: WINDOW_RADIUS + MESH_PAD,
						boxShadow: OBJECT_SHADOW,
					}}
					className="relative mx-auto flex max-w-full items-center justify-center overflow-hidden"
				>
					<div ref={meshRef} aria-hidden="true" className="absolute inset-0" />
					<GrainOverlay />
					<motion.div style={{ scale: windowScale }} className="relative z-10">
						<CodeWindow theme={theme} title="api/users.ts">
							{view ? (
								<MagicMoveCanvas
									tokens={view.tokens}
									lineCount={view.lineCount}
									lineNumberCount={view.lineNumberCount}
									fontSize={WINDOW_FONT}
									lineHeightRatio={LINE_HEIGHT_RATIO}
									fontFamily={theme.fontFamily}
									color={theme.foreground}
									lineNumberColor={`${theme.foreground}26`}
									padding={FRAME_PADDING}
								/>
							) : (
								<div style={{ height: bodyHeight }} />
							)}
						</CodeWindow>
					</motion.div>
				</motion.div>
			</div>

			<Toolbar
				reduce={reduce ?? false}
				playing={playing}
				onPlayToggle={() => setPlaying((p) => !p)}
				presetId={presetId}
				onPresetChange={(id) => {
					setPresetId(id);
					reportPreset?.(id);
				}}
				themeName={themeName}
				onThemeChange={setThemeName}
				aspect={aspect}
				onAspectChange={setAspect}
				caption="This is the real engine: the export matches it frame for frame."
			/>
		</section>
	);
}

/* ──────────── The window ──────────── */

/** macOS window chrome around the morphing code: the object inside the mesh. */
function CodeWindow({
	theme,
	title,
	children,
}: {
	theme: Theme;
	title: string;
	children: ReactNode;
}) {
	return (
		<div
			className="overflow-hidden"
			style={{
				width: WINDOW_WIDTH,
				background: theme.background,
				borderRadius: WINDOW_RADIUS,
				boxShadow: "0 20px 50px -20px rgb(0 0 0 / 0.55)",
			}}
		>
			<div
				className="flex items-center gap-1.5 px-3 py-2.5"
				style={{ borderBottom: `1px solid ${theme.foreground}0f` }}
			>
				<div className="size-2.5 rounded-full bg-[#ff5f57]" />
				<div className="size-2.5 rounded-full bg-[#febc2e]" />
				<div className="size-2.5 rounded-full bg-[#28c840]" />
				<span
					className="ml-2 font-mono text-[10px] tracking-tight"
					style={{ color: `${theme.foreground}59` }}
				>
					{title}
				</span>
			</div>
			{children}
		</div>
	);
}

/* ──────────── The floating toolbar ──────────── */

/**
 * The control island (docs/decisions/2026-08-09-instrument-island.md).
 *
 * One rule sets every control's treatment: a preview where the setting has an
 * appearance, a drawn icon where it does not. Backdrop and theme show
 * themselves; play cannot be previewed; aspect takes both, because at this size
 * a frame's silhouette alone cannot separate 1:1 from 4:5.
 *
 * A second rule sets interaction, reverse-engineered from ui.camera: a value
 * that fits on its button cycles in place, one that does not opens a panel.
 */
function Toolbar({
	reduce,
	playing,
	onPlayToggle,
	presetId,
	onPresetChange,
	themeName,
	onThemeChange,
	aspect,
	onAspectChange,
	caption,
}: {
	reduce: boolean;
	playing: boolean;
	onPlayToggle: () => void;
	presetId: string;
	onPresetChange: (id: string) => void;
	themeName: string;
	onThemeChange: (name: string) => void;
	aspect: AspectId;
	onAspectChange: (id: AspectId) => void;
	caption: string;
}) {
	const [open, setOpen] = useState<null | "backdrop" | "theme">(null);

	/**
	 * The hovered control's label, and where to centre its helper.
	 *
	 * The helper lives outside the island because the island clips its own
	 * overflow while it resizes, which would cut a tooltip in half. It is the
	 * same material as the island — same fill, same pill radius — so it reads as
	 * a piece of the instrument rather than a browser tooltip.
	 */
	const [helper, setHelper] = useState<{ label: string; x: number } | null>(null);
	const dockRef = useRef<HTMLDivElement>(null);

	const showHelper = (label: string) => (event: ReactMouseEvent<HTMLElement>) => {
		const dock = dockRef.current;
		if (!dock) {
			return;
		}
		const target = event.currentTarget.getBoundingClientRect();
		const base = dock.getBoundingClientRect();
		setHelper({ label, x: target.left + target.width / 2 - base.left });
	};

	// The island springs to a measured width, since `width: auto` cannot be
	// animated. A ResizeObserver rather than a mount callback: the row's content
	// changes without remounting, and measuring only on mount left the island
	// clipping its own CTA.
	const [rowWidth, setRowWidth] = useState<number | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);
	const measureRow = useCallback((node: HTMLDivElement | null) => {
		observerRef.current?.disconnect();
		if (!node) {
			return;
		}
		setRowWidth(node.scrollWidth);
		const observer = new ResizeObserver(() => setRowWidth(node.scrollWidth));
		observer.observe(node);
		observerRef.current = observer;
	}, []);

	const preset = MESH_PRESETS.find((p) => p.id === presetId) ?? MESH_PRESETS[0];
	const themeDot = THEME_DOTS.find((t) => t.name === themeName) ?? THEME_DOTS[0];
	const swatchOf = (p: (typeof MESH_PRESETS)[number]) =>
		`linear-gradient(135deg, ${p.blobs[0]?.color ?? p.accent}, ${p.blobs[2]?.color ?? p.accent})`;

	/** Scaling a fixed square, not animating width and height: the morph runs on
	    the compositor instead of forcing a layout pass every frame. */
	const frameScale = (ratio: AspectId) => {
		const [w, h] = ratio.split(":").map(Number);
		const max = Math.max(w ?? 1, h ?? 1);
		return { scaleX: (w ?? 1) / max, scaleY: (h ?? 1) / max };
	};

	const cycleAspect = () => {
		const index = ASPECTS.findIndex((a) => a.id === aspect);
		const next = ASPECTS[(index + 1) % ASPECTS.length];
		if (next) {
			onAspectChange(next.id);
		}
	};

	return (
		<div ref={dockRef} className="lp-island-dock mt-4" onMouseLeave={() => setHelper(null)}>
			<AnimatePresence>
				{helper && (
					<motion.span
						key={helper.label}
						className="lp-island-helper"
						style={{ left: helper.x }}
						// The -50% that centres the helper on its control lives here, not in
						// the stylesheet: Motion writes `transform` to animate y and scale,
						// which overwrites a CSS translateX outright. Keeping it in the
						// variants lets Motion compose the three together.
						// Enters from the island it belongs to, which sits below it.
						initial={{ opacity: 0, y: 4, scale: 0.96, x: "-50%" }}
						animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
						exit={{ opacity: 0, y: 2, scale: 0.98, x: "-50%" }}
						transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
						aria-hidden="true"
					>
						{helper.label}
					</motion.span>
				)}
			</AnimatePresence>
			<motion.div
				className="lp-island"
				role="toolbar"
				aria-label="Preview controls"
				initial={false}
				animate={rowWidth === null ? undefined : { width: rowWidth + ISLAND_PADDING }}
				transition={reduce ? { duration: 0 } : ISLAND_SPRING}
			>
				<AnimatePresence mode="wait" initial={false}>
					{open === null ? (
						<motion.div
							key="root"
							ref={measureRow}
							className="lp-island-row"
							{...islandMotion(reduce)}
							exit={islandExit(reduce)}
						>
							<button
								type="button"
								onClick={onPlayToggle}
								onMouseEnter={showHelper(playing ? "Pause" : "Play")}
								aria-label={playing ? "Pause" : "Play"}
								className="lp-island-button"
							>
								{playing ? <PauseGlyph /> : <PlayGlyph />}
							</button>

							<button
								type="button"
								onClick={() => setOpen("backdrop")}
								onMouseEnter={showHelper(`Backdrop · ${preset?.label ?? ""}`)}
								aria-label={`Backdrop: ${preset?.label ?? ""}. Open backdrop control`}
								className="lp-island-button lp-island-button-tight"
							>
								<span
									className="lp-spec"
									style={{ background: preset ? swatchOf(preset) : undefined }}
								/>
							</button>

							<button
								type="button"
								onClick={() => setOpen("theme")}
								onMouseEnter={showHelper(`Theme · ${themeName}`)}
								aria-label={`Theme: ${themeName}. Open theme control`}
								className="lp-island-button lp-island-button-tight"
							>
								<span className="lp-spec-theme" style={{ background: themeDot?.bg }}>
									<span
										className="lp-spec-line"
										style={{ background: themeDot?.a, width: "100%" }}
									/>
									<span
										className="lp-spec-line"
										style={{ background: themeDot?.b, width: "62%" }}
									/>
								</span>
							</button>

							<button
								type="button"
								onClick={cycleAspect}
								onMouseEnter={showHelper("Aspect ratio")}
								aria-label={`Cycle aspect ratio. ${aspect} active.`}
								className="lp-island-button"
								data-active=""
							>
								<span className="lp-frame-box">
									<motion.span
										className="lp-frame"
										animate={frameScale(aspect)}
										transition={reduce ? { duration: 0 } : FRAME_SPRING}
									/>
								</span>
								<span className="lp-island-num">{aspect}</span>
							</button>

							<Link to="/app" className="lp-island-cta">
								Open studio
							</Link>
						</motion.div>
					) : (
						<motion.div
							key={open}
							ref={measureRow}
							className="lp-island-row"
							{...islandMotion(reduce)}
							exit={islandExit(reduce)}
						>
							<button
								type="button"
								onClick={() => setOpen(null)}
								aria-label="Back to controls"
								className="lp-island-button"
							>
								<BackGlyph />
							</button>

							{open === "backdrop" &&
								MESH_PRESETS.map((p) => (
									<button
										key={p.id}
										type="button"
										onClick={() => onPresetChange(p.id)}
										aria-label={`Backdrop ${p.label}`}
										className="lp-island-button lp-island-button-tight"
										{...(presetId === p.id ? { "data-active": "" } : {})}
									>
										<span className="lp-spec" style={{ background: swatchOf(p) }} />
										{presetId === p.id && (
											<motion.span
												layoutId="island-ring"
												className="lp-island-ring"
												transition={reduce ? { duration: 0 } : RING_SPRING}
											/>
										)}
									</button>
								))}

							{open === "theme" &&
								THEME_DOTS.map((t) => (
									<button
										key={t.name}
										type="button"
										onClick={() => onThemeChange(t.name)}
										aria-label={`Theme ${t.name}`}
										className="lp-island-button lp-island-button-tight"
										{...(themeName === t.name ? { "data-active": "" } : {})}
									>
										<span className="lp-spec-theme" style={{ background: t.bg }}>
											<span className="lp-spec-line" style={{ background: t.a, width: "100%" }} />
											<span className="lp-spec-line" style={{ background: t.b, width: "62%" }} />
										</span>
										{themeName === t.name && (
											<motion.span
												layoutId="island-ring"
												className="lp-island-ring"
												transition={reduce ? { duration: 0 } : RING_SPRING}
											/>
										)}
									</button>
								))}
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>

			<p className="lp-island-caption">{caption}</p>
		</div>
	);
}

/** Sampled off ui.camera: 348 → 322.4 → 324 over ~480ms, so it undershoots and
    settles back rather than easing in. */
const ISLAND_SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const;

/** restDelta matters: without it the spring writes sub-pixel values for seconds
    after the movement is over. A take measured one morph running 2666ms. */
const FRAME_SPRING = {
	type: "spring",
	stiffness: 420,
	damping: 30,
	mass: 0.7,
	restDelta: 0.004,
	restSpeed: 0.01,
} as const;

const RING_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;

/** The island's own horizontal padding, which the measured row does not include. */
const ISLAND_PADDING = 12;

/**
 * The row entrance, measured rather than chosen: it does not fade. The first
 * frame is already at opacity 0.99 and the work is a scale that overshoots.
 * An entrance from opacity 0 reads as a slideshow beside it.
 */
/**
 * And the row's departure, which it did not have: the outgoing controls were a
 * ternary, so they were gone in the frame the panel opened while the arriving
 * ones played a 320ms entrance over the hole they left. Quicker than the
 * entrance on purpose — what is leaving does not need to be watched, it only
 * needs to stop being in the way before the next thing is read.
 */
const islandExit = (reduce: boolean) =>
	reduce
		? { opacity: 0, transition: { duration: 0 } }
		: {
				opacity: 0,
				scale: 0.99,
				transition: {
					duration: 0.1,
					ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
				},
			};

const islandMotion = (reduce: boolean) =>
	reduce
		? { initial: false as const, animate: { opacity: 1 } }
		: {
				initial: { opacity: 0.99, scale: 0.996 },
				animate: { opacity: 1, scale: [0.996, 1.0068, 1] as number[] },
				transition: {
					duration: 0.32,
					ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
				},
			};
