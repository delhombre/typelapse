import {
	isImageBackground,
	isMeshBackground,
	meshGradientCss,
	parseMeshBackground,
	resolveBackgroundCss,
} from "@/application/backgrounds/mesh-gradient";
import { captionAt } from "@/application/captions/caption-timing";
import { focusLineSet } from "@/application/focus/line-ranges";
import { fitCardToCanvas, renderScaleFor } from "@/application/layout/canvas-fit";
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
import { PreviewIsland } from "@/presentation/components/controls/preview-island";
import { useResizeObserverNode } from "@/presentation/hooks/use-resize-observer";
import { useTickAudio } from "@/presentation/hooks/use-tick-audio";
import { useExportStore } from "@/presentation/stores/export.store";
import type { PlaybackState } from "@/presentation/stores/snippet.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	resolveSocialPlatform,
	useSocialPreviewStore,
} from "@/presentation/stores/social-preview.store";
import { getWatermarkColor } from "@/presentation/utils/watermark-color";
import { motion } from "motion/react";
import {
	type CSSProperties,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { FrameChrome, type WindowChrome } from "./frame-chrome";
import { GrainOverlay } from "./grain-overlay";
import { MagicMoveCanvas } from "./magic-move-canvas";
import { ReelsProgress } from "./reels-progress";
import { SocialPreviewOverlay } from "./social-preview-overlay";
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
 * animate via rAF; an uploaded image is painted once: feeding a giant data URL
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

/** Content box (padding excluded) of an element, read live: the fallback used on
 *  the first layout before the ResizeObserver has fired, so the fit has no flash. */
function contentBox(el: HTMLElement): { width: number; height: number } {
	const s = getComputedStyle(el);
	const padX = Number.parseFloat(s.paddingLeft) + Number.parseFloat(s.paddingRight);
	const padY = Number.parseFloat(s.paddingTop) + Number.parseFloat(s.paddingBottom);
	return { width: el.clientWidth - padX, height: el.clientHeight - padY };
}

// Mirror the Remotion composition's canvas constants so the social preview places
// the window at the same fraction of the aspect canvas the video renders. The
// base scale is per-tier there (renderScaleFor), so it is here too: otherwise the
// preview would frame a 4K export differently from the export itself.
const SOCIAL_BASE_VIDEO_SCALE = 2.2;
const SOCIAL_CANVAS_MARGIN = 0.05;

/** Gentle phone-screen rounding for the social aspect box, proportional and capped. */
function socialCanvasRadius(width: number, height: number): number {
	return Math.round(Math.min(28, Math.min(width, height) * 0.05));
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
	// Social-preview view state (ephemeral): drives a faithful aspect-canvas
	// preview painted OUTSIDE the export target, so it never reaches the PNG
	// capture or the render payload.
	const exportWidth = useExportStore((s) => s.width);
	const exportHeight = useExportStore((s) => s.height);
	const socialEnabled = useSocialPreviewStore((s) => s.enabled);
	const socialPlatform = useSocialPreviewStore((s) => s.platform);
	const socialShowGuides = useSocialPreviewStore((s) => s.showGuides);

	const previewRef = useRef<HTMLDivElement>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const isMesh = isMeshBackground(background);
	const isImage = isImageBackground(background);

	// The measured elements live behind a conditional: the first render shows an
	// EmptyState while the plan builds, so the real UI (and its refs) mounts on a
	// LATER render. RefObjects never re-run effects when `.current` changes, so
	// the nodes flow through callback refs into state: the observers attach the
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
	const [cardNatural, setCardNatural] = useState<{ width: number; height: number } | null>(null);

	// Reconcile the social platform against the export aspect (null when off, or
	// when the aspect has no immersive platform, e.g. 16:9).
	const activeSocialPlatform = resolveSocialPlatform(
		socialEnabled,
		socialPlatform,
		exportWidth,
		exportHeight,
	);

	// Social mode swaps the fit-to-viewport code window for a faithful miniature of
	// the EXPORT ASPECT CANVAS: an aspect box fit into the viewport, filled with the
	// export's mesh, holding the code window centered at the SAME fraction the video
	// renders it (shared fitCardToCanvas math). The chrome + guides then sit over the
	// FULL canvas, so they mark the real occluded regions, not the bare window.
	const availWidth = containerEntry?.contentRect.width;
	const availHeight = containerEntry?.contentRect.height;
	const hasCaptionText = snippet.steps.some((s) => (s.annotation ?? "") !== "");
	const socialCanvas = useMemo(() => {
		if (!activeSocialPlatform || !plan || plan.frames.length === 0 || !cardNatural) {
			return null;
		}
		if (!availWidth || !availHeight || availWidth <= 0 || availHeight <= 0) {
			return null;
		}
		const fit = fitCardToCanvas({
			plan,
			chrome: windowChrome,
			fontSize: snippet.theme.fontSize,
			padding: framePadding,
			cardMargin,
			showLineNumbers,
			lineNumberStart,
			hasCaption: hasCaptionText,
			scale: renderScaleFor(exportWidth, exportHeight, SOCIAL_BASE_VIDEO_SCALE),
			canvasWidth: exportWidth,
			canvasHeight: exportHeight,
			canvasMargin: SOCIAL_CANVAS_MARGIN,
		});
		const boxScale = fitScale(exportWidth, exportHeight, availWidth, availHeight);
		const boxWidth = exportWidth * boxScale;
		const boxHeight = exportHeight * boxScale;
		// Fit the window's real (fixed-width) footprint into the same padded-card slot
		// the video reserves for it: widthFraction x heightFraction of the canvas.
		const cardScale = Math.min(
			(fit.widthFraction * boxWidth) / cardNatural.width,
			(fit.heightFraction * boxHeight) / cardNatural.height,
		);
		return { boxWidth, boxHeight, cardScale, radius: socialCanvasRadius(boxWidth, boxHeight) };
	}, [
		activeSocialPlatform,
		plan,
		cardNatural,
		availWidth,
		availHeight,
		windowChrome,
		snippet.theme.fontSize,
		framePadding,
		cardMargin,
		showLineNumbers,
		lineNumberStart,
		hasCaptionText,
		exportWidth,
		exportHeight,
	]);
	const socialActive = socialCanvas !== null;

	// In social mode the window's mesh margin goes transparent and the mesh moves to
	// the aspect box, so the window sits opaque over one continuous canvas (seamless
	// margins), exactly like the export's full-bleed background AbsoluteFill.
	useDynamicBackground(previewRef, socialActive ? "transparent" : background);
	useDynamicBackground(boxRef, socialActive ? background : "transparent");
	// Play the synthesized tick track during preview playback (same rendered WAV the
	// export bakes in), so the preview sounds identical to the video.
	useTickAudio();

	// Leaving the studio stops the playback loop: pause() cancels the rAF so it
	// never ticks against an unmounted view. Record mode (and its debounce timer)
	// is disarmed separately by ResponsiveShell's own unmount cleanup.
	useEffect(() => () => useSnippetStore.getState().pause(), []);

	// Fit-to-viewport for the plain (non-social) code window, plus the card's natural
	// footprint the social placement centers in its aspect box. Both read the same
	// pre-transform measurement, so social scaling never feeds back into it.
	//
	// The content-shape deps (plan, padding, chrome, gutter) are not read below:
	// they re-run this measure right after the DOM they shape has been committed,
	// so the scale is right pre-paint even when an observer delivery is still queued.
	// biome-ignore lint/correctness/useExhaustiveDependencies: content-shape deps are intentional re-measure triggers for the imperative DOM reads
	useLayoutEffect(() => {
		if (!cardNode || !containerNode) {
			return;
		}
		// Prefer the observers' measurements; on the first layout they have not fired
		// yet, so read the live DOM (correct at layout time, before paint: no flash).
		const box = containerEntry?.contentRect ?? contentBox(containerNode);
		const cardSize = cardEntry?.borderBoxSize?.[0];
		// offsetWidth/Height are pre-transform, so the wrapper's own scale never
		// feeds back into the measurement.
		const naturalW = cardSize?.inlineSize ?? cardNode.offsetWidth;
		const naturalH = cardSize?.blockSize ?? cardNode.offsetHeight;
		setFitScaleValue(fitScale(naturalW, naturalH, box.width, box.height));
		setCardNatural((prev) =>
			prev && prev.width === naturalW && prev.height === naturalH
				? prev
				: { width: naturalW, height: naturalH },
		);
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
	// Outer corner radius of the card (concentric law).
	const cardRadius = isTransparent ? 0 : concentric(snippet.theme.borderRadius, cardMargin);

	// In social mode the window's mesh margin goes transparent so the aspect box's
	// canvas shows through as one continuous mesh; everywhere else the card paints
	// its own background exactly as before, so Social off stays byte-identical.
	const cardPaintsMesh = isMesh && !socialActive;
	const cardPaintsImage = isImage && !socialActive;
	const cardBackgroundAnimate =
		cardPaintsMesh || cardPaintsImage
			? undefined
			: { background: isTransparent || socialActive ? "transparent" : background };

	// The single code card: one source of truth for playback AND the PNG capture,
	// reparented between the plain fit-to-viewport wrapper and the social aspect box.
	const cardElement = (
		<motion.div
			ref={attachCard}
			data-export-target
			className={`relative w-[42rem] ${isPlaying && !isTransparent && !socialActive && !isMesh && !isImage ? "bg-animate-playing" : ""}`}
			animate={cardBackgroundAnimate}
			transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
			style={{
				opacity: isBuilding ? 0.85 : 1,
				padding: isTransparent ? 0 : cardMargin,
				// Concentric law: the outer corner follows the window's radius plus the
				// margin, so a square window (radius 0) yields a square card.
				borderRadius: cardRadius,
				// Mesh + image are painted imperatively by useDynamicBackground; this is
				// the pre-paint fallback so there is no flash. In social mode the mesh
				// lives on the box, so the card's own margin stays clear.
				background: socialActive ? undefined : staticBackground(background, isMesh, isImage),
			}}
		>
			{!isTransparent && <GrainOverlay />}

			{/* One content column. The reels bar, the window, the caption and the
						    watermark all live in this z-10 box, so the progress bar lines up
						    with the window's edges instead of bleeding past it over the mesh.
						    FrameShell is block-level `w-full`, so it always fills the column:
						    the reels wrapper, caption and watermark span the same width. */}
			<div className="relative z-10 w-full">
				{!isTransparent && segments >= 2 && (
					<div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: -10 }}>
						<ReelsProgress style={progressStyle} segments={segments} progress={reelsProgress} />
					</div>
				)}
				<FrameShell theme={snippet.theme} title={snippet.title} chrome={windowChrome}>
					{/* Focus zoom pushes the code toward the spotlighted band. Playback
							    drives every frame, so there is no CSS transition: the FrameShell
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
							className="font-mono text-[11px]"
							style={{ color: getWatermarkColor(background, snippet.theme.foreground) }}
						>
							{watermark}
						</span>
					</div>
				)}
			</div>
		</motion.div>
	);

	return (
		<div className="flex h-full flex-col">
			<div
				ref={setContainerNode}
				className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-8"
			>
				{socialCanvas && activeSocialPlatform ? (
					// Faithful aspect-canvas preview: the export's mesh box with the code
					// window centered at the video's true fraction, and the chrome + guides
					// over the FULL canvas. The overlay is a SIBLING of [data-export-target]
					// (never a descendant), so the PNG capture and the Remotion render never
					// see it.
					<motion.div
						ref={boxRef}
						className="relative shrink-0 overflow-hidden"
						style={{
							width: socialCanvas.boxWidth,
							height: socialCanvas.boxHeight,
							borderRadius: socialCanvas.radius,
							background: staticBackground(background, isMesh, isImage),
						}}
						animate={
							isMesh || isImage
								? undefined
								: { background: isTransparent ? "transparent" : background }
						}
						transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
					>
						<div
							className="absolute top-1/2 left-1/2"
							style={{
								transform: `translate(-50%, -50%) scale(${socialCanvas.cardScale})`,
								transformOrigin: "center center",
							}}
						>
							{cardElement}
						</div>
						<SocialPreviewOverlay
							platform={activeSocialPlatform}
							showGuides={socialShowGuides}
							radius={socialCanvas.radius}
						/>
					</motion.div>
				) : (
					<div
						className="shrink-0"
						style={{ transform: `scale(${fitScaleValue})`, transformOrigin: "center center" }}
					>
						{cardElement}
					</div>
				)}
			</div>

			<PreviewIsland />
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
