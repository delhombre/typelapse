import {
	isImageBackground,
	isMeshBackground,
	meshGradientCss,
	parseMeshBackground,
	resolveBackgroundCss,
} from "@/application/backgrounds/mesh-gradient";
import { captionAt } from "@/application/captions/caption-timing";
import { focusLineSet } from "@/application/focus/line-ranges";
import { concentric } from "@/application/layout/concentric";
import { fitScale } from "@/application/layout/fit-scale";
import { LINE_HEIGHT_RATIO } from "@/application/layout/frame-metrics";
import { easeInOutCubic, renderStatic, renderTransition } from "@/application/magic-move/engine";
import {
	NO_ZOOM,
	type ZoomTransform,
	interpolateZoom,
	zoomForFocus,
} from "@/application/magic-move/focus-zoom";
import { renderTyping, typedCharCount } from "@/application/magic-move/typewriter";
import type { Theme } from "@/domain/entities/theme";
import { PlaybackControls } from "@/presentation/components/controls/playback-controls";
import { useResizeObserverNode } from "@/presentation/hooks/use-resize-observer";
import { useTickAudio } from "@/presentation/hooks/use-tick-audio";
import { useExportStore } from "@/presentation/stores/export.store";
import type { PlaybackState } from "@/presentation/stores/snippet.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { getWatermarkColor } from "@/presentation/utils/watermark-color";
import { motion } from "motion/react";
import {
	type CSSProperties,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { FrameChrome, type WindowChrome } from "./frame-chrome";
import { GrainOverlay } from "./grain-overlay";
import { MagicMoveCanvas } from "./magic-move-canvas";
import { ReelsProgress } from "./reels-progress";
import { StepCaption } from "./step-caption";

/** Pre-paint background for the node: mesh base color, image cover CSS, or none. */
function staticBackground(
	background: string,
	isMesh: boolean,
	isImage: boolean,
): string | undefined {
	if (isMesh) {
		return parseMeshBackground(background)?.base;
	}
	if (isImage) {
		return resolveBackgroundCss(background, 0);
	}
	return undefined;
}

/**
 * Paint the background straight on the DOM node (no re-render). Mesh presets
 * animate via rAF; an uploaded image is painted once — feeding a giant data URL
 * through motion's `animate` would be wasteful, so it is set imperatively here.
 */
function useDynamicBackground(ref: RefObject<HTMLDivElement | null>, background: string) {
	useEffect(() => {
		// Image: paint the cover CSS once and clear it on change/unmount. This runs
		// after render + the previous cleanup, so it also restores the image if a
		// mesh cleanup happened to clear the node on the same commit.
		if (isImageBackground(background)) {
			if (ref.current) {
				ref.current.style.background = resolveBackgroundCss(background, 0);
			}
			return () => {
				if (ref.current) {
					ref.current.style.background = "";
				}
			};
		}
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

/** Content box (padding excluded) of an element, read live — the fallback used on
 *  the first layout before the ResizeObserver has fired, so the fit has no flash. */
function contentBox(el: HTMLElement): { width: number; height: number } {
	const s = getComputedStyle(el);
	const padX = Number.parseFloat(s.paddingLeft) + Number.parseFloat(s.paddingRight);
	const padY = Number.parseFloat(s.paddingTop) + Number.parseFloat(s.paddingBottom);
	return { width: el.clientWidth - padX, height: el.clientHeight - padY };
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
		showLineNumbers,
		lineNumberStart,
		framePadding,
		cardMargin,
		watermark,
	} = useSnippetStore();

	const progressStyle = useExportStore((s) => s.progressStyle);
	const typewriter = useExportStore((s) => s.typewriter);
	const focusZoom = useExportStore((s) => s.focusZoom);
	const previewRef = useRef<HTMLDivElement>(null);
	const isMesh = isMeshBackground(background);
	const isImage = isImageBackground(background);
	useDynamicBackground(previewRef, background);
	// Play the synthesized tick track during preview playback (same rendered WAV
	// the export bakes in), so the preview sounds identical to the video.
	useTickAudio();

	// Fit-to-viewport: the card keeps its natural (unscaled) layout size — so the
	// PNG/video export captures it untouched — while the whole frame is visually
	// scaled to fit the viewport. Uniform scale preserves WYSIWYG (same pixels,
	// different zoom) and a long walkthrough no longer overflows the pane.
	//
	// The measured elements live behind a conditional: the first render shows an
	// EmptyState while the plan builds, so the real UI (and its refs) mounts on a
	// LATER render. RefObjects never re-run effects when `.current` changes, so
	// the nodes flow through callback refs into state — the observers attach the
	// moment the elements exist.
	const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
	const [cardNode, setCardNode] = useState<HTMLDivElement | null>(null);
	// One stable callback for the card: useDynamicBackground still needs the
	// RefObject, the fit measurement needs the node-state.
	const attachCard = useCallback((el: HTMLDivElement | null) => {
		previewRef.current = el;
		setCardNode(el);
	}, []);
	const containerEntry = useResizeObserverNode(containerNode);
	const cardEntry = useResizeObserverNode(cardNode);
	const [fitScaleValue, setFitScaleValue] = useState(1);
	// The content-shape deps (plan, padding, chrome, gutter) are not read below —
	// they re-run this measure right after the DOM they shape has been committed,
	// so the scale is right pre-paint even when an observer delivery is still queued.
	// biome-ignore lint/correctness/useExhaustiveDependencies: content-shape deps are intentional re-measure triggers for the imperative DOM reads
	useLayoutEffect(() => {
		if (!cardNode || !containerNode) {
			return;
		}
		// Prefer the observers' measurements; on the first layout they have not fired
		// yet, so read the live DOM (correct at layout time, before paint — no flash).
		const box = containerEntry?.contentRect ?? contentBox(containerNode);
		const cardSize = cardEntry?.borderBoxSize?.[0];
		// offsetWidth/Height are pre-transform, so the wrapper's own scale never
		// feeds back into the measurement.
		const naturalW = cardSize?.inlineSize ?? cardNode.offsetWidth;
		const naturalH = cardSize?.blockSize ?? cardNode.offsetHeight;
		setFitScaleValue(fitScale(naturalW, naturalH, box.width, box.height));
	}, [
		containerEntry,
		cardEntry,
		containerNode,
		cardNode,
		plan,
		framePadding,
		cardMargin,
		windowChrome,
		showLineNumbers,
		lineNumberStart,
	]);

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
			<div
				ref={setContainerNode}
				className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-8"
			>
				<div
					className="shrink-0"
					style={{ transform: `scale(${fitScaleValue})`, transformOrigin: "center center" }}
				>
					<motion.div
						ref={attachCard}
						data-export-target
						className={`relative w-[42rem] ${isPlaying && !isTransparent && !isMesh && !isImage ? "bg-animate-playing" : ""}`}
						animate={
							isMesh || isImage
								? undefined
								: { background: isTransparent ? "transparent" : background }
						}
						transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
						style={{
							opacity: isBuilding ? 0.85 : 1,
							padding: isTransparent ? 0 : cardMargin,
							// Concentric law: the outer corner follows the window's radius plus the
							// margin, so a square window (radius 0) yields a square card. A soft
							// outer corner around a sharp window reads incoherent.
							borderRadius: isTransparent ? 0 : concentric(snippet.theme.borderRadius, cardMargin),
							// Mesh + image are painted imperatively by useDynamicBackground; this is
							// the pre-paint fallback so there is no flash before the effect runs.
							background: staticBackground(background, isMesh, isImage),
						}}
					>
						{!isTransparent && <GrainOverlay />}

						{/* One content column. The reels bar, the window, the caption and the
						    watermark all live in this z-10 box, so the progress bar lines up
						    with the window's edges instead of bleeding past it over the mesh.
						    FrameShell is block-level `w-full`, so it always fills the column —
						    the reels wrapper, caption and watermark span the same width. */}
						<div className="relative z-10 w-full">
							{!isTransparent && segments >= 2 && (
								<div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: -10 }}>
									<ReelsProgress
										style={progressStyle}
										segments={segments}
										progress={reelsProgress}
									/>
								</div>
							)}
							<FrameShell theme={snippet.theme} title={snippet.title} chrome={windowChrome}>
								{/* Focus zoom pushes the code toward the spotlighted band. Playback
							    drives every frame, so there is no CSS transition — the FrameShell
							    body clips the overflow. The zoom wrapper carries the window's own
							    border radius so a scaled (composited) layer never squares the
							    corners. Same transform runs in the Remotion video. */}
								<div style={zoomStyle(view.zoom, focusZoom, snippet.theme.borderRadius)}>
									<MagicMoveCanvas
										tokens={view.tokens}
										lineCount={view.lineCount}
										lineNumberCount={view.lineNumberCount}
										fontSize={snippet.theme.fontSize}
										lineHeightRatio={LINE_HEIGHT_RATIO}
										fontFamily={snippet.theme.fontFamily}
										color={snippet.theme.foreground}
										showLineNumbers={showLineNumbers}
										lineNumberStart={lineNumberStart}
										lineNumberColor={`${snippet.theme.foreground}26`}
										padding={framePadding}
										cursor={view.cursor}
									/>
								</div>
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
			className="code-frame-glow w-full overflow-hidden"
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
	/** Cinematic push-in for this frame; identity unless the step has a spotlight. */
	zoom: ZoomTransform;
}

const EMPTY_VIEW: FrameView = { tokens: [], lineCount: 1, lineNumberCount: 1, zoom: NO_ZOOM };

/**
 * Transform for the zoom wrapper: overflow-clipped, scaled only when zoom is on.
 * Carries the window's border radius (concentric law: the clip matches the radius
 * of the surface it sits in) so a scaled, composited layer never squares the
 * window's corners during a push-in.
 */
function zoomStyle(zoom: ZoomTransform, active: boolean, borderRadius: number): CSSProperties {
	if (!active) {
		return { overflow: "hidden", borderRadius };
	}
	return {
		overflow: "hidden",
		borderRadius,
		transform: `scale(${zoom.scale})`,
		transformOrigin: `50% ${zoom.originYRatio * 100}%`,
	};
}

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
			return {
				tokens,
				lineCount,
				lineNumberCount: lineCount,
				cursor,
				zoom: zoomForFocus(focusSets[0], lineCount),
			};
		}
		if (playback.phase === "transition") {
			const transition = plan.transitions[playback.index];
			const fromFrame = plan.frames[playback.index];
			const toFrame = plan.frames[playback.index + 1];
			if (transition && fromFrame && toFrame) {
				const eased = easeInOutCubic(playback.t);
				const fromZoom = zoomForFocus(focusSets[playback.index], fromFrame.lineCount);
				const toZoom = zoomForFocus(focusSets[playback.index + 1], toFrame.lineCount);
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
					zoom: interpolateZoom(fromZoom, toZoom, playback.t, easeInOutCubic),
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
		zoom: zoomForFocus(focus, frame.lineCount),
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
