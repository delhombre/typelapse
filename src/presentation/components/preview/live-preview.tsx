import {
	isImageBackground,
	isMeshBackground,
	meshGradientCss,
	parseMeshBackground,
	resolveBackgroundCss,
} from "@/application/backgrounds/mesh-gradient";
import { captionAt } from "@/application/captions/caption-timing";
import { scriptFrameAt } from "@/application/export/video-script";
import { focusLineSet } from "@/application/focus/line-ranges";
import {
	BASE_VIDEO_SCALE,
	type ClipFade,
	clipFades,
	previewCardPlacement,
	renderScaleFor,
} from "@/application/layout/canvas-fit";
import { concentric } from "@/application/layout/concentric";
import { fitScale } from "@/application/layout/fit-scale";
import {
	FRAME_SECONDARY_ALPHA_HEX,
	LINE_HEIGHT_RATIO,
	chromeBarHeight,
} from "@/application/layout/frame-metrics";
import { watermarkPlacement } from "@/application/layout/watermark-placement";
import type { CubicBezier } from "@/application/magic-move/easing";
import { renderStatic } from "@/application/magic-move/engine";
import { NO_ZOOM, type ZoomTransform, zoomForFocus } from "@/application/magic-move/focus-zoom";
import { typingHoldIndex } from "@/application/magic-move/typewriter";
import { studioCompositionTimeMs } from "@/application/project/studio-composition";
import {
	primaryCodeOpacity as compiledCodeOpacity,
	hasCodeCard,
} from "@/application/render/composition-slots";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import type { Theme } from "@/domain/entities/theme";
import { useStudioVideoMode } from "@/presentation/contexts/studio-video-mode";
import { useResizeObserverNode } from "@/presentation/hooks/use-resize-observer";
import { useTickAudio } from "@/presentation/hooks/use-tick-audio";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import type { PlaybackState } from "@/presentation/stores/snippet.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	resolveSocialPlatform,
	useSocialPreviewStore,
} from "@/presentation/stores/social-preview.store";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
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
import { ClipFades } from "./clip-fades";
import { FrameChrome, type WindowChrome } from "./frame-chrome";
import { GlowDecoration } from "./glow-decoration";
import { GrainOverlay } from "./grain-overlay";
import { MagicMoveCanvas } from "./magic-move-canvas";
import { ReelsProgress } from "./reels-progress";
import { SocialPreviewOverlay } from "./social-preview-overlay";
import { StepCaption } from "./step-caption";
import { StudioCompositionAudio, StudioCompositionLayers } from "./studio-composition-layers";
import { useCharWidthRatio } from "./use-char-width-ratio";

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
 * Paint the background straight on the DOM node. A mesh preset is painted at
 * `timeSeconds`, the timeline's own time, exactly as the composition paints it at
 * `frame / fps` and the painter at the script's time: paused, the mesh holds; a
 * scrub lands on the same drift the exported frame has. It used to run on its
 * own wall clock, so no paused frame ever matched a timestamp. An uploaded image
 * is painted once: feeding a giant data URL through motion's `animate` would be
 * wasteful, so it is set imperatively here.
 */
function useDynamicBackground(
	ref: RefObject<HTMLDivElement | null>,
	background: string,
	timeSeconds: number,
) {
	// Both painters are layout effects: React runs every layout cleanup before
	// any layout setup in a commit, so switching between an image and a mesh never
	// lets one's cleanup wipe what the other just painted.
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || !isImageBackground(background)) {
			return;
		}
		// Image: paint the cover CSS once and clear it on change/unmount.
		el.style.background = resolveBackgroundCss(background, 0);
		return () => {
			el.style.background = "";
		};
	}, [background, ref]);

	// The mesh repaints whenever the timeline moves, and only then. Reduced
	// motion keeps the first frame on screen: the preference is about what moves
	// in front of the viewer, and the export is not on screen.
	useLayoutEffect(() => {
		const el = ref.current;
		const preset = parseMeshBackground(background);
		if (!el || !preset) {
			return;
		}
		const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		el.style.background = meshGradientCss(preset, reduced ? 0 : timeSeconds);
		return () => {
			el.style.background = "";
		};
	}, [background, ref, timeSeconds]);
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
/**
 * The tightest the stage card's outer corner is allowed to get, and the widest.
 *
 * The corner is concentric with the code window — `window radius + the mesh
 * margin`, so both corners share one centre — right up to this ceiling, and then
 * it stops. Uncapped, the default project (a 12px window inside a 32px margin)
 * asked for 44px, and a 44px corner on a 670px card is a bubble: it disagrees
 * with the crisp window it wraps, and it disagrees with every other surface on
 * the page. It also grew every time the margin did, so the one control that was
 * supposed to add breathing room quietly reshaped the object as well.
 *
 * 20px is the scene's own sheet radius (`--r-sheet` in app.css), which makes the
 * two largest objects on screen — the stage card and the island's raised sheet —
 * share a corner. It also sits beside the landing's product shot, whose mesh
 * frame is 18px.
 *
 * THIS IS STAGE CHROME, NOT ARTWORK, and that is the whole reason a cap is
 * allowed here at all. Neither exporter draws a card corner: the canvas painter
 * fills the backdrop across the whole frame (`frame-painter/painter.ts`, plain
 * `fillRect`) and Remotion does the same with an `AbsoluteFill`, and
 * `FrameScene.card` carries no radius field to round. The rounded card is how
 * the studio presents the video on paper, not something the video contains — so
 * capping it changes no exported pixel. Do not "restore" the uncapped
 * concentric value in the name of WYSIWYG: there is nothing on the other side
 * to be true to.
 */
const STAGE_CARD_MAX_RADIUS = 20;

/** Gentle phone-screen rounding for the social aspect box, proportional and capped. */
function socialCanvasRadius(width: number, height: number): number {
	return Math.round(Math.min(28, Math.min(width, height) * 0.05));
}

export function LivePreview() {
	const videoMode = useStudioVideoMode();
	const {
		snippet,
		plan,
		isBuilding,
		currentStepIndex,
		isPlaying,
		playback,
		playbackProgress,
		playbackElapsedMs,
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
	const transitionEasing = useExportStore((s) => s.transitionEasing);
	const transitionMs = useExportStore((s) => s.transitionMs);
	const exportFps = useExportStore((s) => s.fps);
	const loop = useExportStore((s) => s.loop);
	const composition = useStudioCompositionStore();
	const selectAuthoredAudio = useStudioCompositionSelectionStore((state) => state.selectAudioCue);
	const compositionDocument = useMemo(() => composition.toDocument(), [composition]);
	// A blank scene counts: only the composed canvas fades the card off it.
	const hasCompositionLayers = compositionDocument.project.scenes.some(
		(scene) => scene.blocks.some((block) => block.kind !== "code") || !hasCodeCard(scene),
	);
	const hasCompositionAudio = compositionDocument.project.audioCues.length > 0;
	const hasComposition = hasCompositionLayers || hasCompositionAudio;
	const compositionTimeline = useMemo(
		() => compileSceneTimeline({ document: compositionDocument, fps: exportFps, loop }),
		[compositionDocument, exportFps, loop],
	);
	// Playing or scrubbed, the composition follows the canonical clock, which
	// runs past the last scene while an audio cue is still sounding.
	const compositionTimeMs = playback
		? playbackElapsedMs
		: studioCompositionTimeMs(
				compositionDocument.project.scenes,
				transitionMs,
				currentStepIndex,
				null,
			);
	const compositionFrame = compositionTimeline.frameAt(
		Math.round((compositionTimeMs / 1_000) * exportFps),
	);
	// The compiled frame's card opacity, the number the painter fades the card by.
	const primaryCodeOpacity = compiledCodeOpacity(compositionFrame);
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

	// Reconcile the social platform against the export aspect (null when off, or
	// when the aspect has no immersive platform, e.g. 16:9).
	const activeSocialPlatform = resolveSocialPlatform(
		socialEnabled,
		socialPlatform,
		exportWidth,
		exportHeight,
	);
	const aspectCanvasEnabled = videoMode || activeSocialPlatform !== null || hasComposition;

	// Social mode swaps the fit-to-viewport code window for a faithful miniature of
	// the EXPORT ASPECT CANVAS: an aspect box fit into the viewport, filled with the
	// export's mesh, holding the code window centered at the SAME fraction the video
	// renders it (shared fitCardToCanvas math). The chrome + guides then sit over the
	// FULL canvas, so they mark the real occluded regions, not the bare window.
	const availWidth = containerEntry?.contentRect.width;
	const availHeight = containerEntry?.contentRect.height;
	const hasCaptionText = snippet.steps.some((s) => (s.annotation ?? "") !== "");
	const charWidthRatio = useCharWidthRatio(snippet.theme.fontFamily, snippet.theme.fontSize);
	const aspectCanvas = useMemo(() => {
		if (!aspectCanvasEnabled || !plan || plan.frames.length === 0) {
			return null;
		}
		if (!availWidth || !availHeight || availWidth <= 0 || availHeight <= 0) {
			return null;
		}
		if (!Number.isFinite(charWidthRatio)) {
			return null;
		}
		const boxScale = fitScale(exportWidth, exportHeight, availWidth, availHeight);
		const boxWidth = exportWidth * boxScale;
		const boxHeight = exportHeight * boxScale;
		// The exporters' card, from the same placement table: the window at their
		// width laid out at editor size, and one transform to their text scale.
		const placement = previewCardPlacement({
			plan,
			chrome: windowChrome,
			fontSize: snippet.theme.fontSize,
			padding: framePadding,
			cardMargin,
			showLineNumbers,
			lineNumberStart,
			hasCaption: hasCaptionText,
			canvasWidth: exportWidth,
			canvasHeight: exportHeight,
			charWidthRatio,
			boxWidth,
		});
		return {
			boxWidth,
			boxHeight,
			boxScale,
			windowWidth: placement.windowWidth,
			// At the readable floor the window stops growing and clips its code,
			// with the exporters' fades, at editor size.
			clip: placement.clip
				? {
						maxHeight: placement.windowHeight,
						fades: clipFades({
							clip: placement.clip,
							windowWidth: placement.windowWidth,
							windowHeight: placement.windowHeight,
							chromeHeight: chromeBarHeight(windowChrome, 1),
							fontSize: snippet.theme.fontSize,
						}),
					}
				: null,
			cardScale: placement.cardScale,
			radius: socialCanvasRadius(boxWidth, boxHeight),
		};
	}, [
		aspectCanvasEnabled,
		plan,
		availWidth,
		availHeight,
		charWidthRatio,
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
	const aspectCanvasActive = aspectCanvas !== null;

	// In social mode the window's mesh margin goes transparent and the mesh moves to
	// the aspect box, so the window sits opaque over one continuous canvas (seamless
	// margins), exactly like the export's full-bleed background AbsoluteFill.
	const timelineSeconds = compositionTimeMs / 1_000;
	useDynamicBackground(
		previewRef,
		aspectCanvasActive ? "transparent" : background,
		timelineSeconds,
	);
	useDynamicBackground(boxRef, aspectCanvasActive ? background : "transparent", timelineSeconds);
	// Play the synthesized tick track during preview playback (same rendered WAV the
	// export bakes in), so the preview sounds identical to the video.
	useTickAudio();

	// Leaving the studio stops the playback loop: pause() cancels the rAF so it
	// never ticks against an unmounted view. Record mode (and its debounce timer)
	// is disarmed separately by ResponsiveShell's own unmount cleanup.
	useEffect(() => () => useSnippetStore.getState().pause(), []);

	// Fit-to-viewport for the plain (non-canvas) code window, from the card's
	// pre-transform measurement. The aspect canvas does not read it: its card is
	// placed by the shared table, not by what the DOM happened to lay out.
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
	const reelsProgress = playback
		? playbackProgress
		: (Math.min(currentStepIndex, Math.max(segments - 1, 0)) + 1) / Math.max(segments, 1);

	const isEmpty = snippet.code.trim() === "" && snippet.steps.length === 0;
	if (isEmpty && !isBuilding) {
		return <EmptyState />;
	}
	if (!plan || plan.frames.length === 0) {
		return <EmptyState building />;
	}

	// A title card first is typed past: the first scene with code is typed.
	const typingIndex = typingHoldIndex(snippet.steps.map((s) => s.code));
	const firstCode = snippet.steps[typingIndex]?.code ?? snippet.code;
	// Per-step spotlight, applied at render time (no re-tokenize when focus edits).
	const focusSets = snippet.steps.map((s) => focusLineSet(s.highlightRanges));
	const view = resolveView(
		plan,
		playback,
		currentStepIndex,
		{ typewriter, firstCode, typingIndex },
		focusSets,
		transitionEasing,
	);

	// Per-step captions overlaid beneath the frame; timing is shared with the video.
	const annotations = snippet.steps.map((s) => s.annotation ?? "");
	const hasCaptions = annotations.some((a) => a !== "");
	const caption = playback
		? captionAt({ phase: playback.phase, index: playback.index, t: playback.t }, annotations)
		: {
				text: annotations[currentStepIndex] ?? "",
				opacity: annotations[currentStepIndex] ? 1 : 0,
			};

	const isTransparent = background === "transparent";
	// A ceiling on the growth, never a licence to invert: at the widest margin and
	// the roundest window the cap would have made the card's corner tighter than
	// the corner it wraps, which is the one thing `concentric` already refuses to
	// do. So the cap is floored by the window's own radius.
	const cardRadius = isTransparent
		? 0
		: Math.min(
				concentric(snippet.theme.borderRadius, cardMargin),
				Math.max(STAGE_CARD_MAX_RADIUS, snippet.theme.borderRadius),
			);

	// In social mode the window's mesh margin goes transparent so the aspect box's
	// canvas shows through as one continuous mesh; everywhere else the card paints
	// its own background exactly as before, so Social off stays byte-identical.
	const cardPaintsMesh = isMesh && !aspectCanvasActive;
	const cardPaintsImage = isImage && !aspectCanvasActive;
	const cardBackgroundAnimate =
		cardPaintsMesh || cardPaintsImage
			? undefined
			: { background: isTransparent || aspectCanvasActive ? "transparent" : background };

	// The single code card: one source of truth for playback AND the PNG capture,
	// reparented between the plain fit-to-viewport wrapper and the social aspect box.
	const cardElement = (
		<motion.div
			ref={attachCard}
			data-export-target
			className={`relative ${aspectCanvas ? "" : "w-[42rem]"} ${isPlaying && !isTransparent && !aspectCanvasActive && !isMesh && !isImage ? "bg-animate-playing" : ""}`}
			animate={cardBackgroundAnimate}
			transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
			style={{
				opacity: isBuilding ? 0.85 : 1,
				padding: isTransparent ? 0 : cardMargin,
				// On the export canvas the window is exactly as wide as the exporters
				// draw it (at editor size; the wrapper scales it). Elsewhere the card
				// keeps the studio's fixed 42rem.
				width: aspectCanvas
					? aspectCanvas.windowWidth + 2 * (isTransparent ? 0 : cardMargin)
					: undefined,
				// Concentric law: the outer corner follows the window's radius plus the
				// margin, so a square window (radius 0) yields a square card.
				borderRadius: cardRadius,
				// Mesh + image are painted imperatively by useDynamicBackground; this is
				// the pre-paint fallback so there is no flash. In social mode the mesh
				// lives on the box, so the card's own margin stays clear.
				background: aspectCanvasActive ? undefined : staticBackground(background, isMesh, isImage),
			}}
			onClick={() => {
				if (!hasComposition) {
					return;
				}
				const sceneId = compositionDocument.project.scenes[currentStepIndex]?.id;
				if (sceneId) {
					composition.selectBlock(sceneId, null);
					selectAuthoredAudio(null);
				}
			}}
		>
			{/* On the export canvas the grain lies on the whole canvas, under the card,
			    as both exporters bake it; on the card alone it read as a rounded plate
			    over the margin that no exported frame contains. */}
			{!isTransparent && !aspectCanvasActive && <GrainOverlay />}

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
				<FrameShell
					theme={snippet.theme}
					title={snippet.title}
					chrome={windowChrome}
					clip={aspectCanvas?.clip ?? null}
				>
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
							lineNumberColor={`${snippet.theme.foreground}${FRAME_SECONDARY_ALPHA_HEX}`}
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

				{/* On the export canvas the mark sits in the canvas corner instead, where
				    both exporters draw it (below). */}
				{watermark && !aspectCanvasActive && (
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

	// The frame and nothing else. The island used to be the last item of this
	// column, which anchored it under the preview and kept it out of the top
	// bar's way. There is no top bar any more and no column either: the shell
	// places the instrument on the stage's own centre line, so the preview is
	// free to be the picture and only the picture.
	return (
		<div className="flex h-full flex-col">
			{hasCompositionAudio ? (
				<StudioCompositionAudio frame={compositionFrame} playing={isPlaying} />
			) : null}
			<div
				ref={setContainerNode}
				className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-8"
			>
				{aspectCanvas ? (
					// Faithful aspect-canvas preview: the export's mesh box with the code
					// window centered at the video's true fraction, and the chrome + guides
					// over the FULL canvas. The overlay is a SIBLING of [data-export-target]
					// (never a descendant), so the PNG capture and the Remotion render never
					// see it.
					<motion.div
						ref={boxRef}
						layout
						className="relative shrink-0 overflow-hidden"
						style={{
							width: aspectCanvas.boxWidth,
							height: aspectCanvas.boxHeight,
							borderRadius: aspectCanvas.radius,
							background: staticBackground(background, isMesh, isImage),
						}}
						animate={
							isMesh || isImage
								? undefined
								: { background: isTransparent ? "transparent" : background }
						}
						transition={{
							layout: springs.default,
							background: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
						}}
					>
						{/* The exporters' canvas texture, the glow and the grain they lay over
						    the background under the card, at the box's share of the canvas. */}
						{!isTransparent ? <GlowDecoration scale={aspectCanvas.boxScale} /> : null}
						{!isTransparent ? <GrainOverlay scale={aspectCanvas.boxScale} /> : null}
						{hasCompositionLayers ? (
							<div
								className="sc-composition-surface-host"
								data-slot="under-code"
								style={{
									width: compositionDocument.project.canvas.width,
									height: compositionDocument.project.canvas.height,
									transform: `scale(${aspectCanvas.boxWidth / compositionDocument.project.canvas.width})`,
								}}
							>
								<StudioCompositionLayers
									document={compositionDocument}
									frame={compositionFrame}
									slot="under-code"
									playing={isPlaying}
									selectedBlockId={composition.selectedBlockId}
									onSelectLayer={(sceneId, blockId) => {
										composition.selectBlock(sceneId, blockId);
										selectAuthoredAudio(null);
										const index = snippet.steps.findIndex((step) => step.id === sceneId);
										if (index >= 0) {
											useSnippetStore.getState().setCurrentStepIndex(index);
										}
									}}
								/>
							</div>
						) : null}
						<div
							className="absolute top-1/2 left-1/2"
							style={{
								zIndex: 1,
								opacity: primaryCodeOpacity,
								pointerEvents: primaryCodeOpacity === 0 ? "none" : undefined,
								transform: `translate(-50%, -50%) scale(${aspectCanvas.cardScale})`,
								transformOrigin: "center center",
							}}
						>
							{cardElement}
						</div>
						{hasCompositionLayers ? (
							<div
								className="sc-composition-surface-host"
								data-slot="over-code"
								style={{
									width: compositionDocument.project.canvas.width,
									height: compositionDocument.project.canvas.height,
									transform: `scale(${aspectCanvas.boxWidth / compositionDocument.project.canvas.width})`,
								}}
							>
								<StudioCompositionLayers
									document={compositionDocument}
									frame={compositionFrame}
									slot="over-code"
									playing={isPlaying}
									selectedBlockId={composition.selectedBlockId}
									onSelectLayer={(sceneId, blockId) => {
										composition.selectBlock(sceneId, blockId);
										selectAuthoredAudio(null);
										const index = snippet.steps.findIndex((step) => step.id === sceneId);
										if (index >= 0) {
											useSnippetStore.getState().setCurrentStepIndex(index);
										}
									}}
								/>
							</div>
						) : null}
						{watermark ? (
							<CanvasWatermark
								text={watermark}
								color={getWatermarkColor(background, snippet.theme.foreground)}
								fontFamily={snippet.theme.fontFamily}
								scale={renderScaleFor(exportWidth, exportHeight, BASE_VIDEO_SCALE)}
								boxScale={aspectCanvas.boxScale}
							/>
						) : null}
						{activeSocialPlatform && (
							<SocialPreviewOverlay
								platform={activeSocialPlatform}
								showGuides={socialShowGuides}
								radius={aspectCanvas.radius}
							/>
						)}
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
		</div>
	);
}

/**
 * The user's mark at the canvas corner, from the table both exporters read, at
 * the box's share of the canvas. It used to sit under the window, inside the
 * card, which also pushed the centred card up by its own height.
 *
 * Laid out at the export's own size and scaled down as one picture, like the
 * card: set at the box's ten-odd pixels, the browser would round the font's
 * ascent and descent at that size and the line would land a pixel off the file.
 */
function CanvasWatermark({
	text,
	color,
	fontFamily,
	scale,
	boxScale,
}: { text: string; color: string; fontFamily: string; scale: number; boxScale: number }) {
	const placement = watermarkPlacement(scale);
	return (
		<span
			aria-hidden="true"
			style={{
				position: "absolute",
				zIndex: 3,
				right: placement.right * boxScale,
				bottom: placement.bottom * boxScale,
				fontFamily,
				fontSize: placement.fontSize,
				lineHeight: "normal",
				whiteSpace: "nowrap",
				color,
				pointerEvents: "none",
				transform: `scale(${boxScale})`,
				transformOrigin: "100% 100%",
			}}
		>
			{text}
		</span>
	);
}

/** Themed card wrapping the animated code, topped by the shared window chrome. */
function FrameShell({
	theme,
	title,
	chrome,
	clip,
	children,
}: {
	theme: Theme;
	title: string;
	chrome: WindowChrome;
	clip: { maxHeight: number; fades: ClipFade[] } | null;
	children: ReactNode;
}) {
	return (
		<div
			className="code-frame-glow relative w-full overflow-hidden"
			style={{
				background: theme.background,
				borderRadius: theme.borderRadius,
				maxHeight: clip?.maxHeight,
			}}
		>
			<FrameChrome chrome={chrome} title={title} foreground={theme.foreground} />
			{children}
			{clip ? <ClipFades fades={clip.fades} background={theme.background} /> : null}
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
	currentStepIndex: number,
	typing: { typewriter: boolean; firstCode: string; typingIndex: number },
	focusSets: (Set<number> | undefined)[],
	transitionEasing: CubicBezier,
): FrameView {
	if (playback && plan.frames[playback.index]) {
		// The same walk the exported file takes, so a morph and the loop morph
		// look the same in both.
		return scriptFrameAt({ plan, ...typing, focusSets, transitionEasing }, playback);
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
			<span className="text-xs">
				{building ? "Preparing preview…" : "Write code to see the preview"}
			</span>
		</div>
	);
}
