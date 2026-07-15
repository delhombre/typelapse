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
import { AnimatedSizeContainer } from "@/presentation/components/ui/animated-size-container";
import { springs } from "@/presentation/motion";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Swatch, THEME_SWATCHES } from "./restyle-swatches";

const LINE_HEIGHT_RATIO = 1.6;
const FRAME_PADDING = 20;

const THEMES: Record<string, () => Theme> = {
	midnight: Theme.midnight,
	aurora: Theme.aurora,
	dracula: Theme.dracula,
	"one-dark": Theme.oneDark,
	catppuccin: Theme.catppuccin,
	nord: Theme.nord,
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
const LOOP_CODES = [...DEMO_FRAMES, DEMO_FRAMES[0] ?? ""];
const HOLDS = [1300, 1500, 2200, 800];

interface DemoView {
	tokens: RenderToken[];
	lineCount: number;
	lineNumberCount: number;
}

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
 * The landing hero: a faithful shot of the actual studio, built from the real
 * product parts — Shiki highlighting on the left, the shared magic-move engine
 * and canvas morphing on the right. Not a mock; it renders live and loops.
 */
export function StudioShowcase({
	themeName = "aurora",
	presetId = "aurora",
	onThemeChange,
	onPresetChange,
}: {
	themeName?: string;
	presetId?: string;
	onThemeChange?: (name: string) => void;
	onPresetChange?: (id: string) => void;
}) {
	const theme = useMemo(() => (THEMES[themeName] ?? Theme.aurora)(), [themeName]);
	const preset = useMemo(
		() => MESH_PRESETS.find((p) => p.id === presetId) ?? MESH_PRESETS[0],
		[presetId],
	);
	// The rAF loop reads the live preset from a ref, so switching the background
	// recolors the mesh without tearing down and restarting the animation.
	const presetRef = useRef(preset);
	presetRef.current = preset;
	const meshRef = useRef<HTMLDivElement>(null);
	const [view, setView] = useState<DemoView | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [progress, setProgress] = useState(0);
	const [editorHtml, setEditorHtml] = useState<string[]>([]);

	// Pre-highlight each frame's code once for the editor panel.
	useEffect(() => {
		let cancelled = false;
		Promise.all(DEMO_FRAMES.map((code) => shikiAdapter.highlight(code, "typescript", theme.name)))
			.then((html) => {
				if (!cancelled) {
					setEditorHtml(html);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [theme.name]);

	// Drive the preview with the real engine, looping.
	useEffect(() => {
		let raf = 0;
		let cancelled = false;
		const lastSig = { current: "" };

		const initialPreset = presetRef.current;
		if (meshRef.current && initialPreset) {
			meshRef.current.style.background = meshGradientCss(initialPreset, 0);
		}

		shikiAdapter
			.getRawHighlighter()
			.then((h) => {
				if (cancelled) {
					return;
				}
				const plan = buildMagicMovePlan(h, LOOP_CODES, "typescript", theme.name, false);
				const timeline = buildTimeline(HOLDS);
				let start = performance.now();

				const tick = () => {
					if (cancelled) {
						return;
					}
					const now = performance.now();
					let elapsed = now - start;
					if (elapsed >= timeline.totalMs) {
						start = now;
						elapsed = 0;
					}
					const pos = locate(timeline, elapsed);
					const idx = pos.phase === "transition" && pos.t >= 0.5 ? pos.index + 1 : pos.index;
					const editorIndex = idx % DEMO_FRAMES.length;

					const sig = `${pos.phase}:${pos.index}:${pos.phase === "transition" ? Math.round(pos.t * 60) : 0}`;
					if (sig !== lastSig.current) {
						lastSig.current = sig;
						setView(resolveView(plan, pos));
						setActiveIndex(editorIndex);
						setProgress(pos.progress);
					}
					const livePreset = presetRef.current;
					if (meshRef.current && livePreset) {
						meshRef.current.style.background = meshGradientCss(livePreset, now / 1000);
					}
					raf = requestAnimationFrame(tick);
				};
				raf = requestAnimationFrame(tick);
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [theme.name]);

	return (
		<div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#101019] to-[#0a0a11] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.07),0_40px_120px_-30px_rgb(0_0_0/0.85)]">
			{/* Window chrome */}
			<div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
				<span className="size-3 rounded-full bg-[#ff5f57]" />
				<span className="size-3 rounded-full bg-[#febc2e]" />
				<span className="size-3 rounded-full bg-[#28c840]" />
				<span className="mx-auto rounded-md bg-white/5 px-3 py-1 font-mono text-[11px] text-neutral-500">
					typelapse — {themeName}
				</span>
			</div>

			<div className="grid grid-cols-1 md:h-[452px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
				{/* Editor panel */}
				<div className="flex flex-col overflow-hidden border-white/5 border-b p-5 md:border-r md:border-b-0">
					<PanelLabel>Code</PanelLabel>
					{/* Spring the code block's height + fade the swap, so the editor morphs
					    as smoothly as the preview instead of snapping between frames. */}
					<AnimatedSizeContainer height className="mt-3" transition={springs.gentle}>
						<motion.div
							key={activeIndex}
							initial={{ opacity: 0.3 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
							className="studio-code font-mono text-[12.5px] leading-[1.7] md:text-[13px]"
							style={{ color: theme.foreground }}
							// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output from our own highlighter
							dangerouslySetInnerHTML={{ __html: editorHtml[activeIndex] ?? "" }}
						/>
					</AnimatedSizeContainer>
					<PanelLabel className="mt-5">Steps</PanelLabel>
					<div className="mt-3 flex items-center gap-2">
						{DEMO_FRAMES.map((_, i) => (
							<span
								key={`step-${i + 1}`}
								className={`flex h-7 items-center gap-2 rounded-lg border px-2.5 font-mono text-[11px] tabular-nums transition-colors duration-300 ${
									i === activeIndex
										? "border-accent/40 bg-accent/15 text-accent"
										: "border-white/10 bg-white/[0.02] text-neutral-500"
								}`}
							>
								{String(i + 1).padStart(2, "0")}
							</span>
						))}
					</div>
				</div>

				{/* Preview panel */}
				<div className="flex flex-col bg-black/20 p-5">
					<div
						ref={meshRef}
						className="code-frame-glow relative flex flex-1 items-center justify-center overflow-hidden p-6"
						style={{ borderRadius: 22 }}
					>
						<GrainOverlay />
						<div className="relative z-10 w-full max-w-[420px]">
							<FrameShell theme={theme} title="api/users.ts">
								{view ? (
									<MagicMoveCanvas
										tokens={view.tokens}
										lineCount={view.lineCount}
										lineNumberCount={view.lineNumberCount}
										fontSize={theme.fontSize}
										lineHeightRatio={LINE_HEIGHT_RATIO}
										fontFamily={theme.fontFamily}
										color={theme.foreground}
										lineNumberColor={`${theme.foreground}26`}
										padding={FRAME_PADDING}
									/>
								) : (
									<div style={{ height: 4 * theme.fontSize * LINE_HEIGHT_RATIO }} />
								)}
							</FrameShell>
						</div>
					</div>

					{/* Playback bar */}
					<div className="mt-4 flex items-center gap-3">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
							<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" role="img">
								<title>Playing</title>
								<path d="M8 5v14l11-7z" style={{ transform: "translateX(1px)" }} />
							</svg>
						</span>
						<div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
							<div
								className="h-full rounded-full bg-white/70"
								style={{ width: `${Math.round(progress * 100)}%` }}
							/>
						</div>
						<span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
							{String(activeIndex + 1).padStart(2, "0")} /{" "}
							{String(DEMO_FRAMES.length).padStart(2, "0")}
						</span>
					</div>
				</div>
			</div>

			{/* Restyle toolbar — the window's own bottom bar recolours the live demo. */}
			{onThemeChange && onPresetChange && (
				<div className="flex flex-wrap items-center justify-between gap-y-2 border-white/5 border-t px-4 py-2.5">
					<span className="font-mono text-[10px] text-neutral-600 uppercase tracking-[0.18em]">
						restyle it live
					</span>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-2">
							{MESH_PRESETS.map((p) => (
								<Swatch
									key={p.id}
									group="bg"
									title={p.label}
									selected={presetId === p.id}
									onClick={() => onPresetChange(p.id)}
									preview={`linear-gradient(135deg, ${p.blobs[0]?.color ?? p.accent}, ${p.blobs[2]?.color ?? p.accent})`}
								/>
							))}
						</div>
						<span className="h-4 w-px bg-white/10" />
						<div className="flex items-center gap-2">
							{THEME_SWATCHES.map((t) => (
								<Swatch
									key={t.name}
									group="theme"
									title={t.name}
									selected={themeName === t.name}
									onClick={() => onThemeChange(t.name)}
									preview={t.bg}
									square
								/>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function PanelLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={`text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600 ${className}`}
		>
			{children}
		</span>
	);
}

/** macOS window chrome around the animating code — the preview's inner frame. */
function FrameShell({
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
			className="overflow-hidden rounded-xl"
			style={{ background: theme.background, boxShadow: "0 20px 50px -20px rgb(0 0 0 / 0.6)" }}
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
