import {
	isMeshBackground,
	meshGradientCss,
	parseMeshBackground,
} from "@/application/backgrounds/mesh-gradient";
import { easeInOutCubic, renderStatic, renderTransition } from "@/application/magic-move/engine";
import { renderTyping, typedCharCount } from "@/application/magic-move/typewriter";
import type { Theme } from "@/domain/entities/theme";
import { PlaybackControls } from "@/presentation/components/controls/playback-controls";
import { useExportStore } from "@/presentation/stores/export.store";
import type { PlaybackState } from "@/presentation/stores/snippet.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { GrainOverlay } from "./grain-overlay";
import { MagicMoveCanvas } from "./magic-move-canvas";
import { ReelsProgress } from "./reels-progress";

const LINE_HEIGHT_RATIO = 1.6;

/** Drive an animated mesh background straight on the DOM node (no re-render). */
function useMeshBackground(ref: RefObject<HTMLDivElement | null>, background: string) {
	useEffect(() => {
		const preset = parseMeshBackground(background);
		if (!preset) {
			return;
		}
		// Respect reduced motion: paint a single static frame, don't oscillate.
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) {
			if (ref.current) {
				ref.current.style.background = meshGradientCss(preset, 0);
			}
			return () => {
				if (ref.current) {
					ref.current.style.background = "";
				}
			};
		}
		let raf = 0;
		const start = performance.now();
		const tick = () => {
			const el = ref.current;
			if (el) {
				el.style.background = meshGradientCss(preset, (performance.now() - start) / 1000);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			if (ref.current) {
				ref.current.style.background = "";
			}
		};
	}, [background, ref]);
}

export function LivePreview() {
	const {
		snippet,
		plan,
		isBuilding,
		currentStepIndex,
		isPlaying,
		playback,
		playbackProgress,
		background,
		framePadding,
		watermark,
	} = useSnippetStore();

	const progressStyle = useExportStore((s) => s.progressStyle);
	const typewriter = useExportStore((s) => s.typewriter);
	const previewRef = useRef<HTMLDivElement>(null);
	const isMesh = isMeshBackground(background);
	useMeshBackground(previewRef, background);

	const segments = snippet.steps.length;
	const reelsProgress = isPlaying
		? playbackProgress
		: (Math.min(currentStepIndex, Math.max(segments - 1, 0)) + 1) / Math.max(segments, 1);

	const isEmpty = snippet.code.trim() === "" && snippet.steps.length === 0;
	if (isEmpty && !isBuilding) {
		return <EmptyState />;
	}
	if (!plan || plan.frames.length === 0) {
		return <EmptyState building />;
	}

	const firstCode = snippet.steps[0]?.code ?? snippet.code;
	const view = resolveView(plan, playback, isPlaying, currentStepIndex, typewriter, firstCode);
	const isTransparent = background === "transparent";

	return (
		<div className="flex h-full flex-col">
			<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
				<motion.div
					ref={previewRef}
					data-export-target
					className={`relative w-full max-w-2xl ${isPlaying && !isTransparent && !isMesh ? "bg-animate-playing" : ""}`}
					animate={isMesh ? undefined : { background: isTransparent ? "transparent" : background }}
					transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
					style={{
						opacity: isBuilding ? 0.85 : 1,
						padding: isTransparent ? 0 : 32,
						// Concentric with the 32px padding: outer radius = inner radius + gap.
						borderRadius: isTransparent ? 0 : snippet.theme.borderRadius + 32,
						background: isMesh ? parseMeshBackground(background)?.base : undefined,
					}}
				>
					{!isTransparent && <GrainOverlay />}
					{!isTransparent && segments >= 2 && (
						<ReelsProgress style={progressStyle} segments={segments} progress={reelsProgress} />
					)}

					<div className="relative z-10">
						<FrameShell theme={snippet.theme} title={snippet.title}>
							<MagicMoveCanvas
								tokens={view.tokens}
								lineCount={view.lineCount}
								lineNumberCount={view.lineNumberCount}
								fontSize={snippet.theme.fontSize}
								lineHeightRatio={LINE_HEIGHT_RATIO}
								fontFamily={snippet.theme.fontFamily}
								color={snippet.theme.foreground}
								lineNumberColor={`${snippet.theme.foreground}26`}
								padding={framePadding}
								cursor={view.cursor}
							/>
						</FrameShell>

						{watermark && (
							<div className="mt-2 text-right">
								<span
									className="font-mono text-[10px]"
									style={{ color: getWatermarkColor(background, snippet.theme.foreground) }}
								>
									{watermark}
								</span>
							</div>
						)}
					</div>
				</motion.div>
			</div>

			<div className="flex shrink-0 justify-center pb-3">
				<PlaybackControls />
			</div>
		</div>
	);
}

/** Themed card with macOS window chrome — the shell around the animated code. */
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
			className="code-frame-glow overflow-hidden"
			style={{ background: theme.background, borderRadius: theme.borderRadius }}
		>
			<div
				className="flex items-center gap-2 px-4 py-3"
				style={{ borderBottom: `1px solid ${theme.foreground}0f` }}
			>
				<div className="size-[11px] rounded-full bg-[#ff5f57]" />
				<div className="size-[11px] rounded-full bg-[#febc2e]" />
				<div className="size-[11px] rounded-full bg-[#28c840]" />
				{title && (
					<span
						className="ml-2 font-mono text-[11px] tracking-tight"
						style={{ color: `${theme.foreground}59` }}
					>
						{title}
					</span>
				)}
			</div>
			{children}
		</div>
	);
}

interface FrameView {
	tokens: ReturnType<typeof renderStatic>;
	lineCount: number;
	lineNumberCount: number;
	cursor?: { line: number; col: number } | null;
}

const EMPTY_VIEW: FrameView = { tokens: [], lineCount: 1, lineNumberCount: 1 };

/** Pick the tokens to paint for the current playback position. */
function resolveView(
	plan: NonNullable<ReturnType<typeof useSnippetStore.getState>["plan"]>,
	playback: PlaybackState | null,
	isPlaying: boolean,
	currentStepIndex: number,
	typewriter: boolean,
	firstCode: string,
): FrameView {
	if (isPlaying && playback) {
		if (typewriter && playback.phase === "hold" && playback.index === 0 && plan.typing) {
			const reveal = typedCharCount(firstCode.length, playback.t);
			const { tokens, cursor } = renderTyping(firstCode, plan.typing, reveal);
			const lineCount = plan.frames[0]?.lineCount ?? 1;
			return { tokens, lineCount, lineNumberCount: lineCount, cursor };
		}
		if (playback.phase === "transition") {
			const transition = plan.transitions[playback.index];
			const fromFrame = plan.frames[playback.index];
			const toFrame = plan.frames[playback.index + 1];
			if (transition && fromFrame && toFrame) {
				const eased = easeInOutCubic(playback.t);
				return {
					tokens: renderTransition(transition.from, transition.to, playback.t),
					lineCount: fromFrame.lineCount + (toFrame.lineCount - fromFrame.lineCount) * eased,
					lineNumberCount: Math.max(fromFrame.lineCount, toFrame.lineCount),
				};
			}
		}
		return staticView(plan.frames[playback.index] ?? plan.frames[0]);
	}

	const index = Math.min(Math.max(currentStepIndex, 0), plan.frames.length - 1);
	return staticView(plan.frames[index] ?? plan.frames[0]);
}

function staticView(
	frame: { tokens: Parameters<typeof renderStatic>[0]; lineCount: number } | undefined,
): FrameView {
	if (!frame) {
		return EMPTY_VIEW;
	}
	return {
		tokens: renderStatic(frame.tokens),
		lineCount: frame.lineCount,
		lineNumberCount: frame.lineCount,
	};
}

function EmptyState({ building = false }: { building?: boolean }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-400">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				role="img"
			>
				<title>Code icon</title>
				<polyline points="16 18 22 12 16 6" />
				<polyline points="8 6 2 12 8 18" />
			</svg>
			<span className="font-mono text-xs">
				{building ? "Preparing preview…" : "Write code to see the preview"}
			</span>
		</div>
	);
}

/** Pick a watermark color that contrasts with the background. */
function getWatermarkColor(background: string, themeForeground: string): string {
	if (background === "transparent") {
		return `${themeForeground}66`;
	}
	if (background.startsWith("mesh:")) {
		return "rgba(255,255,255,0.4)";
	}
	const hexMatch = background.match(/#([0-9a-fA-F]{6})/);
	if (!hexMatch?.[1]) {
		return `${themeForeground}66`;
	}
	const hex = hexMatch[1];
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
}
