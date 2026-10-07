import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveBackgroundCss } from "../../src/application/backgrounds/mesh-gradient";
import {
	BASE_VIDEO_SCALE,
	CANVAS_MARGIN,
	clipFades,
	fitCardToCanvas,
	renderScaleFor,
} from "../../src/application/layout/canvas-fit";
import { advanceProbeFont, measureCharWidthRatio } from "../../src/application/layout/char-advance";
import type { LineClip } from "../../src/application/layout/line-clip";
import { watermarkPlacement } from "../../src/application/layout/watermark-placement";
import {
	FRAME_SECONDARY_ALPHA_HEX,
	LINE_HEIGHT_RATIO,
	chromeBarHeight,
} from "../../src/application/layout/frame-metrics";
import { type ScriptFrame, scriptFrameAt } from "../../src/application/export/video-script";
import { NO_ZOOM } from "../../src/application/magic-move/focus-zoom";
import { captionAt } from "../../src/application/captions/caption-timing";
import { ClipFades } from "../../src/presentation/components/preview/clip-fades";
import { FocusZoomBody } from "../../src/presentation/components/preview/focus-zoom-body";
import { FrameChrome } from "../../src/presentation/components/preview/frame-chrome";
import { GlowDecoration } from "../../src/presentation/components/preview/glow-decoration";
import { GrainOverlay } from "../../src/presentation/components/preview/grain-overlay";
import { MagicMoveCanvas } from "../../src/presentation/components/preview/magic-move-canvas";
import { ReelsProgress } from "../../src/presentation/components/preview/reels-progress";
import { StepCaption } from "../../src/presentation/components/preview/step-caption";
import { getWatermarkColor } from "../../src/presentation/utils/watermark-color";
import { loadCompositionFonts } from "./font-files";
import type { RenderInput, ThemeData } from "./types";

// The base scale and the safe-area margin are the shared placement table's
// (application/layout/canvas-fit), read by the preview and the painter too.
export { BASE_VIDEO_SCALE };

/** Advance ÷ size of the theme font as this page resolves it, or of its fallback. */
function measureAdvance(fontFamily: string, fontSize: number): number {
	const ctx = document.createElement("canvas").getContext("2d");
	return ctx ? measureCharWidthRatio(ctx, fontFamily, fontSize) : Number.NaN;
}

/**
 * Load the fonts, then measure the theme font's advance: the card is sized on
 * the same advance the `ch`-placed glyphs land on, measured the way the preview
 * and the painter measure theirs. The frame is held until both are done.
 */
function useFontLoaded(fontFamily: string, fontSize: number): number {
	const [handle] = useState(() => delayRender(`Loading fonts: ${fontFamily}`));
	const [charWidthRatio, setCharWidthRatio] = useState(() => measureAdvance(fontFamily, fontSize));

	useEffect(() => {
		// The theme's family and Inter, which sets the step captions (StepCaption),
		// through the shared registry: the bundled copy of the files the preview
		// loads, so nothing is asked of a third party.
		loadCompositionFonts(advanceProbeFont(fontFamily, fontSize), fontFamily, "Inter")
			.then(() => {
				setCharWidthRatio(measureAdvance(fontFamily, fontSize));
				continueRender(handle);
			})
			.catch((err) => {
				console.error("Font loading failed:", err);
				// The fallback is what the glyphs will be set in, so it is what to size on.
				setCharWidthRatio(measureAdvance(fontFamily, fontSize));
				continueRender(handle);
			});
	}, [handle, fontFamily, fontSize]);

	return charWidthRatio;
}

interface Segment {
	type: "hold" | "transition" | "loop";
	index: number;
	startFrame: number;
	endFrame: number;
}

function buildSegments(durationsMs: number[], transitionMs: number, fps: number, loop: boolean): Segment[] {
	const segments: Segment[] = [];
	const transitionFrames = Math.round((transitionMs / 1000) * fps);
	let cursor = 0;
	for (let i = 0; i < durationsMs.length; i++) {
		const holdFrames = Math.round(((durationsMs[i] ?? 0) / 1000) * fps);
		segments.push({ type: "hold", index: i, startFrame: cursor, endFrame: cursor + holdFrames });
		cursor += holdFrames;
		if (i < durationsMs.length - 1) {
			segments.push({ type: "transition", index: i, startFrame: cursor, endFrame: cursor + transitionFrames });
			cursor += transitionFrames;
		}
	}
	// Seamless loop: morph the last step back to the first so a looping player
	// never hard-cuts.
	if (loop && durationsMs.length >= 2) {
		segments.push({ type: "loop", index: durationsMs.length - 1, startFrame: cursor, endFrame: cursor + transitionFrames });
	}
	return segments;
}

export function TypelapseComposition({ input }: { input: RenderInput }) {
	const frame = useCurrentFrame();
	const { fps, width, height } = useVideoConfig();
	const { theme, background, watermark, audioDataUrl } = input;
	const videoScale = renderScaleFor(width, height, BASE_VIDEO_SCALE);
	const isTransparent = background === "transparent";
	const backgroundCss = isTransparent ? "transparent" : resolveBackgroundCss(background, frame / fps);

	return (
		<AbsoluteFill style={{ background: backgroundCss }}>
			{/* Synthesized tick track, mounted at frame 0 so it spans the whole video. */}
			{audioDataUrl && <Audio src={audioDataUrl} />}
			{!isTransparent && <GlowDecoration />}
			{!isTransparent && <GrainOverlay />}
			<CodeCard input={input} />
			{watermark && (
				<WatermarkOverlay
					text={watermark}
					color={getWatermarkColor(background, theme.foreground)}
					fontFamily={theme.fontFamily}
					scale={videoScale}
				/>
			)}
		</AbsoluteFill>
	);
}

/**
 * The card at this frame: magic move, typewriter, focus zoom, reels bar and
 * caption, centred by the shared fit. Exported for the multimedia composition,
 * which lays a project's text and image layers under and over this same card.
 */
export function CodeCard({ input }: { input: RenderInput }) {
	const charWidthRatio = useFontLoaded(input.theme.fontFamily, input.theme.fontSize);

	const frame = useCurrentFrame();
	const { fps, width, height, durationInFrames } = useVideoConfig();
	const { plan, steps, theme, title, background, windowChrome, showLineNumbers, lineNumberStart, framePadding, cardMargin, transitionMs, loop, focusZoom, progressStyle } =
		input;

	const segments = buildSegments(
		steps.map((s) => s.duration),
		transitionMs,
		fps,
		loop,
	);
	const active = segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? segments[segments.length - 1];

	// Everything drawn at "video size" scales with the canvas's short edge, so the
	// framing is identical at every resolution tier and only the fidelity changes.
	const videoScale = renderScaleFor(width, height, BASE_VIDEO_SCALE);

	// Per-step spotlight: mirror the preview's render-time focus so the export matches.
	const focusSets = steps.map((s) => (s.focus && s.focus.length > 0 ? new Set(s.focus) : undefined));
	const view = resolveView(input, active, frame, focusSets);
	const cursor = view.cursor;

	// Per-step captions overlaid beneath the frame; same timing function as the preview.
	const annotations = steps.map((s) => s.caption ?? "");
	const hasCaptions = annotations.some((a) => a !== "");
	const caption = captionForSegment(active, frame, annotations);

	return (
		<CenteredFrame
			plan={plan}
			theme={theme}
			title={title}
			windowChrome={windowChrome}
			showLineNumbers={showLineNumbers}
			lineNumberStart={lineNumberStart}
			framePadding={framePadding}
			cardMargin={cardMargin}
			canvasWidth={width}
			canvasHeight={height}
			videoScale={videoScale}
			charWidthRatio={charWidthRatio}
			reels={
				steps.length >= 2 ? (
					<ReelsProgress
						style={progressStyle}
						segments={steps.length}
						progress={frame / Math.max(1, durationInFrames)}
						scale={videoScale}
					/>
				) : null
			}
			captions={annotations}
			caption={
				hasCaptions
					? (lines) => (
							<StepCaption
								text={caption.text}
								opacity={caption.opacity}
								scale={videoScale}
								lines={lines}
							/>
						)
					: undefined
			}
		>
			{/* Focus zoom: the preview's component, so the video matches. The code column
			    cuts a long line where the fit says, as the preview and the painter do. */}
			{(lineClip) => (
				<FocusZoomBody zoom={view.zoom} active={focusZoom} borderRadius={theme.borderRadius * videoScale}>
					<MagicMoveCanvas
						tokens={view.tokens}
						lineCount={view.lineCount}
						lineNumberCount={view.lineNumberCount}
						fontSize={theme.fontSize * videoScale}
						lineHeightRatio={LINE_HEIGHT_RATIO}
						fontFamily={theme.fontFamily}
						color={theme.foreground}
						showLineNumbers={showLineNumbers}
						lineNumberStart={lineNumberStart}
						lineNumberColor={`${theme.foreground}${FRAME_SECONDARY_ALPHA_HEX}`}
						padding={framePadding * videoScale}
						cursor={cursor}
						firstRow={view.firstRow}
						lineClip={lineClip}
					/>
				</FocusZoomBody>
			)}
		</CenteredFrame>
	);
}

type FrameView = Omit<ScriptFrame, "progress" | "timeSeconds">;

const EMPTY_VIEW: FrameView = {
	tokens: [],
	firstRow: 0,
	lineCount: 1,
	lineNumberCount: 1,
	cursor: null,
	zoom: NO_ZOOM,
};

/**
 * The card's content at this frame, from the walk the painter and the preview
 * take (`video-script`): typewriter, morph, focus, push-in and a long file's
 * window, so the three renderers draw one picture.
 */
function resolveView(
	input: RenderInput,
	active: Segment | undefined,
	frame: number,
	focusSets: (Set<number> | undefined)[],
): FrameView {
	if (!active) {
		return EMPTY_VIEW;
	}
	const span = active.endFrame - active.startFrame;
	return scriptFrameAt(
		{
			plan: input.plan,
			transitionEasing: input.transitionEasing,
			typewriter: input.typewriter,
			firstCode: input.steps[input.typingIndex ?? 0]?.code ?? "",
			typingIndex: input.typingIndex,
			focusSets,
		},
		{
			phase: active.type,
			index: active.index,
			t: span > 0 ? (frame - active.startFrame) / span : 1,
		},
	);
}

/** Themed card with window chrome, centered and sized to fit the widest line. */
/**
 * The card: the window (plus its reels bar and caption) centred and uniformly
 * scaled into the canvas. Exported for the layout tests, which assert the width
 * contract between the three stacked children; nothing else imports it.
 */
export function CenteredFrame({
	plan,
	theme,
	title,
	windowChrome,
	showLineNumbers,
	lineNumberStart,
	framePadding,
	cardMargin,
	canvasWidth,
	canvasHeight,
	videoScale,
	charWidthRatio,
	reels,
	captions,
	caption,
	children,
}: {
	plan: RenderInput["plan"];
	theme: ThemeData;
	title: string;
	windowChrome: RenderInput["windowChrome"];
	showLineNumbers: boolean;
	lineNumberStart: number;
	framePadding: number;
	cardMargin: number;
	canvasWidth: number;
	canvasHeight: number;
	/** Upscale factor for this canvas, from `renderScaleFor`. */
	videoScale: number;
	/** The theme font's measured advance ÷ size (`measureCharWidthRatio`). */
	charWidthRatio: number;
	reels?: React.ReactNode;
	/** Every scene's caption: the band under the card takes the longest's lines. */
	captions?: readonly string[];
	/** The caption band, given the lines the fit reserved for it. */
	caption?: (lines: number) => React.ReactNode;
	/** The window's body; a function is given where the code column cuts a long line. */
	children: React.ReactNode | ((lineClip: LineClip | null) => React.ReactNode);
}) {
	const radius = theme.borderRadius * videoScale;
	const isDark = isColorDark(theme.background);

	// Natural size of the card + caption unit and its fit into the canvas, from
	// the SHARED placement math (application/layout/canvas-fit): the same function
	// the browser social preview calls, so the window lands at the exact same
	// fraction of the canvas in the video and the preview. Uses the segment-max
	// line count so the fit is constant for the whole video (no zoom-pump between
	// steps), and the full, uncapped width so long lines scale down not clip.
	const fit = fitCardToCanvas({
		plan,
		chrome: windowChrome,
		fontSize: theme.fontSize,
		padding: framePadding,
		cardMargin,
		showLineNumbers,
		lineNumberStart,
		captions: caption ? (captions ?? []) : [],
		scale: videoScale,
		canvasWidth,
		canvasHeight,
		canvasMargin: CANVAS_MARGIN,
		charWidthRatio,
	});
	const natural = fit.natural;
	const scale = fit.scale;
	// The card wraps the window (and caption) in a proportional mesh border: the
	// same cardMargin the preview paints, as transparent padding the full-bleed
	// background AbsoluteFill shows through.
	const cardPadding = cardMargin * videoScale;

	const boxShadow = isDark
		? "0 0 0 1px rgba(255,255,255,0.05), 0 24px 64px -16px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.4)"
		: "0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px -16px rgba(0,0,0,0.18), 0 8px 24px -8px rgba(0,0,0,0.12)";

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{/* The card = the content column + a transparent mesh border of cardPadding
			    on all four sides; the full-bleed background AbsoluteFill shows through
			    it. The whole card is uniformly scaled to fit the canvas, so the border
			    is proportional to cardMargin exactly as in the preview (WYSIWYG). */}
			<div
				style={{
					padding: cardPadding,
					transform: `scale(${scale})`,
					transformOrigin: "center center",
				}}
			>
				{/* Content column: `position: relative` anchors the reels bar, which
				    floats just above the window at the window's width. */}
				<div
					style={{
						position: "relative",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
					}}
				>
					{reels && (
						<div
							style={{
								position: "absolute",
								top: -(10 * videoScale),
								left: 0,
								width: natural.width,
								zIndex: 20,
								pointerEvents: "none",
							}}
						>
							{reels}
						</div>
					)}
					<div
						data-code-window
						style={{
							position: "relative",
							width: natural.width,
							// At the readable floor the window stops growing and clips its code.
							maxHeight: fit.clip ? fit.windowHeight : undefined,
							background: theme.background,
							borderRadius: radius,
							overflow: "hidden",
							boxShadow,
						}}
					>
						<FrameChrome
							chrome={windowChrome}
							title={title}
							foreground={theme.foreground}
							scale={videoScale}
							width={natural.width}
						/>
						{typeof children === "function" ? children(fit.lineClip) : children}
						<ClipFades
							background={theme.background}
							fades={clipFades({
								clip: fit.clip,
								windowWidth: natural.width,
								windowHeight: fit.windowHeight,
								chromeHeight: chromeBarHeight(windowChrome, videoScale),
								fontSize: theme.fontSize * videoScale,
							})}
						/>
					</div>
					{/* The caption band takes the window's width, like the reels bar above
					    it. The column centres its children, so an unconstrained caption
					    would size to its own text: `StepCaption` would never wrap (nothing
					    to overflow) and a caption longer than a short code line would widen
					    the column past the size `fitCardToCanvas` measured, pushing the card
					    off the canvas. Pinning it here makes the two-line wrap structural,
					    exactly as the preview's block-level column does. */}
					{caption && fit.captionLines > 0 && (
						<div style={{ width: natural.width }}>{caption(fit.captionLines)}</div>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * Caption text + opacity for the active segment, frame-driven. Holds map to
 * `captionAt`'s hold; transitions to its cross-dissolve. A loop-back segment
 * morphs the last step to the first, so it is treated as a two-item transition
 * from the last caption to the first.
 */
function captionForSegment(
	active: Segment | undefined,
	frame: number,
	annotations: string[],
): { text: string; opacity: number } {
	if (!active || active.type === "hold") {
		return captionAt({ phase: "hold", index: active?.index ?? 0, t: 0 }, annotations);
	}
	const span = active.endFrame - active.startFrame;
	const t = span > 0 ? (frame - active.startFrame) / span : 1;
	if (active.type === "loop") {
		const last = annotations.length - 1;
		return captionAt({ phase: "transition", index: 0, t }, [
			annotations[last] ?? "",
			annotations[0] ?? "",
		]);
	}
	return captionAt({ phase: "transition", index: active.index, t }, annotations);
}

function isColorDark(color: string): boolean {
	const hex = color.replace("#", "");
	if (hex.length !== 6) return true;
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * The user's mark, bottom-right of the canvas.
 *
 * `scale` is the same `renderScaleFor` factor the card, the caption and the
 * progress bar take: everything drawn at video size grows with the canvas's short
 * edge, so a tier buys sharpness without reframing the shot. The watermark used
 * to sit at fixed pixels and so shrank against everything around it — at 4K it
 * read half the size, half as far from the corner. Dividing by the base scale
 * turns it back into a plain tier multiplier: 1 at 1080p, 2 at 4K.
 *
 * Exported for the layout tests; the composition is its only real caller.
 */
export function WatermarkOverlay({
	text,
	color,
	fontFamily,
	scale,
}: { text: string; color: string; fontFamily: string; scale: number }) {
	// One table for the three renderers (`watermark-placement`).
	const placement = watermarkPlacement(scale);
	return (
		<div
			style={{
				position: "absolute",
				bottom: placement.bottom,
				right: placement.right,
				fontFamily,
				fontSize: placement.fontSize,
				color,
			}}
		>
			{text}
		</div>
	);
}
