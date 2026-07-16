import {
	isMeshBackground,
	meshGradientCss,
	parseMeshBackground,
} from "@/application/backgrounds/mesh-gradient";
import { captionAt } from "@/application/captions/caption-timing";
import { focusLineSet } from "@/application/focus/line-ranges";
import { easeInOutCubic, renderStatic, renderTransition } from "@/application/magic-move/engine";
import { renderTyping, typedCharCount } from "@/application/magic-move/typewriter";
import type { Theme } from "@/domain/entities/theme";
import { PlaybackControls } from "@/presentation/components/controls/playback-controls";
import { useExportStore } from "@/presentation/stores/export.store";
import type { PlaybackState } from "@/presentation/stores/snippet.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { getWatermarkColor } from "@/presentation/utils/watermark-color";
import { motion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { FrameChrome, type WindowChrome } from "./frame-chrome";
import { GrainOverlay } from "./grain-overlay";
import { MagicMoveCanvas } from "./magic-move-canvas";
import { ReelsProgress } from "./reels-progress";
import { StepCaption } from "./step-caption";

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
		windowChrome,
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
	// Per-step spotlight, applied at render time (no re-tokenize when focus edits).
	const focusSets = snippet.steps.map((s) => focusLineSet(s.highlightRanges));
	const view = resolveView(
		plan,
		playback,
		isPlaying,
		currentStepIndex,
		typewriter,
		firstCode,
		focusSets,
	);

	// Per-step captions overlaid beneath the frame; timing is shared with the video.
	const annotations = snippet.steps.map((s) => s.annotation ?? "");
	const hasCaptions = annotations.some((a) => a !== "");
	const caption =
		isPlaying && playback
			? captionAt({ phase: playback.phase, index: playback.index, t: playback.t }, annotations)
			: {
					text: annotations[currentStepIndex] ?? "",
					opacity: annotations[currentStepIndex] ? 1 : 0,
				};

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
						<FrameShell theme={snippet.theme} title={snippet.title} chrome={windowChrome}>
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

						{hasCaptions && (
							<StepCaption
								text={caption.text}
								opacity={caption.opacity}
								color={getWatermarkColor(background, snippet.theme.foreground)}
							/>
						)}

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

/** Themed card wrapping the animated code, topped by the shared window chrome. */
function FrameShell({
	theme,
	title,
	chrome,
	children,
}: {
	theme: Theme;
	title: string;
	chrome: WindowChrome;
	children: ReactNode;
}) {
	return (
		<div
			className="code-frame-glow overflow-hidden"
			style={{ background: theme.background, borderRadius: theme.borderRadius }}
		>
			<FrameChrome chrome={chrome} title={title} foreground={theme.foreground} />
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
	focusSets: (Set<number> | undefined)[],
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
					tokens: renderTransition(
						transition.from,
						transition.to,
						playback.t,
						{},
						focusSets[playback.index],
						focusSets[playback.index + 1],
					),
					lineCount: fromFrame.lineCount + (toFrame.lineCount - fromFrame.lineCount) * eased,
					lineNumberCount: Math.max(fromFrame.lineCount, toFrame.lineCount),
				};
			}
		}
		return staticView(plan.frames[playback.index] ?? plan.frames[0], focusSets[playback.index]);
	}

	const index = Math.min(Math.max(currentStepIndex, 0), plan.frames.length - 1);
	return staticView(plan.frames[index] ?? plan.frames[0], focusSets[index]);
}

function staticView(
	frame: { tokens: Parameters<typeof renderStatic>[0]; lineCount: number } | undefined,
	focus?: Set<number>,
): FrameView {
	if (!frame) {
		return EMPTY_VIEW;
	}
	return {
		tokens: renderStatic(frame.tokens, focus),
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
