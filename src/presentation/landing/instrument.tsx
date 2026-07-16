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
import { useResizeObserver } from "@/presentation/hooks/use-resize-observer";
import { springs } from "@/presentation/motion";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

/* The instrument runs the real product parts: the same three-step `api/users.ts`
   demo, tokenized by Shiki, keyed + morphed by the shared magic-move engine, and
   painted by the shared MagicMoveCanvas — so it looks exactly like the export. */

const THEMES: Record<string, () => Theme> = {
	midnight: Theme.midnight,
	aurora: Theme.aurora,
	frost: Theme.frost,
	dracula: Theme.dracula,
	"one-dark": Theme.oneDark,
	catppuccin: Theme.catppuccin,
	nord: Theme.nord,
};

/** Theme swatches for the toolbar — name + the theme's own background hex. */
const THEME_DOTS: { name: string; bg: string }[] = [
	{ name: "midnight", bg: "#0d1117" },
	{ name: "aurora", bg: "#1a1b2e" },
	{ name: "frost", bg: "#f0f4f8" },
	{ name: "dracula", bg: "#282a36" },
	{ name: "one-dark", bg: "#282c34" },
	{ name: "catppuccin", bg: "#1e1e2e" },
	{ name: "nord", bg: "#2e3440" },
];

/** The three live aspects — the mesh canvas springs between these sizes. */
const ASPECTS = [
	{ id: "16:9", w: 760, h: 428 },
	{ id: "1:1", w: 470, h: 470 },
	{ id: "9:16", w: 300, h: 534 },
] as const;

type AspectId = (typeof ASPECTS)[number]["id"];

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

const MESH_PAD = 26;
const WINDOW_WIDTH = 452;
const WINDOW_FONT = 13;
const FRAME_PADDING = 18;
const LINE_HEIGHT_RATIO = 1.6;
/** Natural window footprint (its tallest, 5-line state) — used to fit + centre it. */
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
 * The heart of the page — a single, live, playable frame. It loops the real
 * magic-move engine over the `api/users.ts` demo on an animated mesh backdrop,
 * and a floating toolbar restyles it: play/pause, five mesh backgrounds, seven
 * themes, three aspects. Everything below the frame just tunes this one object.
 */
export function Instrument() {
	const reduce = useReducedMotion();
	const [themeName, setThemeName] = useState("aurora");
	const [presetId, setPresetId] = useState("aurora");
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

	// Responsive fit: measure the available width and shrink the whole canvas so a
	// 760px-wide 16:9 frame never overflows a phone. Each aspect fills up to the
	// available width but is never upscaled past its natural size.
	const wrapperRef = useRef<HTMLDivElement>(null);
	const resize = useResizeObserver(wrapperRef);
	const target = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
	const availW = resize?.contentRect?.width;
	const fitScale = availW ? Math.min(1, availW / target.w) : 1;

	const meshW = useSpring(target.w * fitScale, springs.gentle);
	const meshH = useSpring(target.h * fitScale, springs.gentle);
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
	}, [target, fitScale, reduce, meshW, meshH]);

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

	// Drive playback. While playing, advance the clock and drift the mesh; while
	// paused, hold the exact morph position (the mesh freezes at its last moment).
	useEffect(() => {
		if (!plan) {
			return;
		}
		const { plan: built, timeline } = plan;
		if (!playing) {
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
			meshTRef.current = now / 1000;
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
	}, [plan, playing]);

	// Recolour a paused mesh when the background swatch changes (the rAF loop owns
	// the mesh while playing).
	useEffect(() => {
		if (playing || !preset) {
			return;
		}
		if (meshRef.current) {
			meshRef.current.style.background = meshGradientCss(preset, meshTRef.current);
		}
	}, [preset, playing]);

	const bodyHeight = 5 * WINDOW_FONT * LINE_HEIGHT_RATIO;

	return (
		<section className="mx-auto w-full max-w-5xl px-6">
			<div ref={wrapperRef} className="w-full">
				<motion.div
					style={{
						width: meshW,
						height: meshH,
						padding: MESH_PAD,
						// Concentric: outer radius = window radius + the mesh padding.
						borderRadius: theme.borderRadius + MESH_PAD,
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
				onPresetChange={setPresetId}
				themeName={themeName}
				onThemeChange={setThemeName}
				aspect={aspect}
				onAspectChange={setAspect}
			/>

			<p className="mt-3 text-center text-[13px] text-ash">
				This is the real engine — the export matches it frame for frame.
			</p>
		</section>
	);
}

/* ──────────── The window ──────────── */

/** macOS window chrome around the morphing code — the object inside the mesh. */
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
				borderRadius: theme.borderRadius,
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
}) {
	return (
		<div className="mt-6 flex justify-center">
			<div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-black/8 bg-white px-3 py-2 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.18)]">
				<button
					type="button"
					onClick={onPlayToggle}
					aria-label={playing ? "Pause" : "Play"}
					className="flex size-8 items-center justify-center rounded-full bg-ink text-white"
				>
					{playing ? <PauseIcon /> : <PlayIcon />}
				</button>

				<Divider />

				<div className="flex items-center gap-2.5">
					{MESH_PRESETS.map((p) => (
						<Dot
							key={p.id}
							round
							reduce={reduce}
							selected={presetId === p.id}
							onClick={() => onPresetChange(p.id)}
							label={`Background ${p.label}`}
							background={`linear-gradient(135deg, ${p.blobs[0]?.color ?? p.accent}, ${p.blobs[2]?.color ?? p.accent})`}
						/>
					))}
				</div>

				<Divider />

				<div className="flex items-center gap-2.5">
					{THEME_DOTS.map((t) => (
						<Dot
							key={t.name}
							bordered
							reduce={reduce}
							selected={themeName === t.name}
							onClick={() => onThemeChange(t.name)}
							label={`Theme ${t.name}`}
							background={t.bg}
						/>
					))}
				</div>

				<Divider />

				<div className="flex items-center gap-0.5">
					{ASPECTS.map((a) => (
						<AspectOption
							key={a.id}
							id={a.id}
							reduce={reduce}
							active={aspect === a.id}
							onClick={() => onAspectChange(a.id)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function Divider() {
	return <span aria-hidden="true" className="h-4 w-px bg-black/10" />;
}

/** A restyle swatch — round for backgrounds, soft-square for themes. */
function Dot({
	selected,
	onClick,
	background,
	label,
	round = false,
	bordered = false,
	reduce,
}: {
	selected: boolean;
	onClick: () => void;
	background: string;
	label: string;
	round?: boolean;
	bordered?: boolean;
	reduce: boolean;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			aria-label={label}
			aria-pressed={selected}
			whileHover={reduce ? undefined : { scale: 1.12 }}
			whileTap={reduce ? undefined : { scale: 0.9 }}
			transition={springs.snappy}
			className="flex items-center justify-center rounded-full"
		>
			<span
				className={`size-5 ${round ? "rounded-full" : "rounded-[6px]"} ${
					bordered ? "border border-black/10" : ""
				} ${selected ? "ring-2 ring-ink ring-offset-2 ring-offset-white" : ""}`}
				style={{ background }}
			/>
		</motion.button>
	);
}

/** One option in the aspect segmented control; the black pill glides via layoutId. */
function AspectOption({
	id,
	active,
	onClick,
	reduce,
}: {
	id: AspectId;
	active: boolean;
	onClick: () => void;
	reduce: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={`relative rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
				active ? "text-white" : "text-ash hover:text-ink"
			}`}
		>
			{active && (
				<motion.span
					layoutId="aspect-pill"
					aria-hidden="true"
					className="absolute inset-0 rounded-full bg-ink"
					transition={reduce ? { duration: 0 } : springs.snappy}
				/>
			)}
			<span className="relative z-10">{id}</span>
		</button>
	);
}

/* ──────────── Icons ──────────── */

function PlayIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" role="img">
			<title>Play</title>
			<path d="M8 5v14l11-7z" style={{ transform: "translateX(1px)" }} />
		</svg>
	);
}

function PauseIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" role="img">
			<title>Pause</title>
			<rect x="6" y="5" width="4" height="14" rx="1" />
			<rect x="14" y="5" width="4" height="14" rx="1" />
		</svg>
	);
}
