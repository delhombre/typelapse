import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveBackgroundCss } from "../../src/application/backgrounds/mesh-gradient";
import { fitCardToCanvas, renderScaleFor } from "../../src/application/layout/canvas-fit";
import { LINE_HEIGHT_RATIO } from "../../src/application/layout/frame-metrics";
import {
	type LaidOutFrame,
	easeInOutCubic,
	renderStatic,
	renderTransition,
} from "../../src/application/magic-move/engine";
import {
	NO_ZOOM,
	type ZoomTransform,
	interpolateZoom,
	zoomForFocus,
} from "../../src/application/magic-move/focus-zoom";
import { captionAt } from "../../src/application/captions/caption-timing";
import { renderTyping, typedCharCount } from "../../src/application/magic-move/typewriter";
import { FrameChrome } from "../../src/presentation/components/preview/frame-chrome";
import { GrainOverlay } from "../../src/presentation/components/preview/grain-overlay";
import { MagicMoveCanvas } from "../../src/presentation/components/preview/magic-move-canvas";
import { ReelsProgress } from "../../src/presentation/components/preview/reels-progress";
import { StepCaption } from "../../src/presentation/components/preview/step-caption";
import { getWatermarkColor } from "../../src/presentation/utils/watermark-color";
import type { RenderInput, ThemeData } from "./types";

/**
 * Upscale factor from the 14px editor preview to crisp text at the reference
 * 1080p tier. Higher tiers multiply it by their share of that short edge (see
 * `renderScaleFor`), so 4K draws the same shot with twice the pixels rather
 * than the same card marooned in a bigger background.
 */
const BASE_VIDEO_SCALE = 2.2;
/** Safe-area margin on each side of the canvas the card is fit into. */
const CANVAS_MARGIN = 0.05;

function useFontLoaded(fontFamily: string) {
	const [handle] = useState(() => delayRender(`Loading fonts: ${fontFamily}`));

	useEffect(() => {
		const fontName = fontFamily.split(",")[0]?.trim().replace(/'/g, "") ?? "JetBrains Mono";
		const googleName = fontName.replace(/\s+/g, "+");
		const monoUrl = `https://fonts.googleapis.com/css2?family=${googleName}:wght@400;500;700&display=swap`;
		// Inter powers the step captions (StepCaption), so load it alongside the mono font.
		const interUrl = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";

		Promise.all([monoUrl, interUrl].map((url) => fetch(url).then((res) => res.text())))
			.then((sheets) => {
				for (const css of sheets) {
					const style = document.createElement("style");
					style.textContent = css;
					document.head.appendChild(style);
				}
				return document.fonts.ready;
			})
			.then(() => continueRender(handle))
			.catch((err) => {
				console.error("Font loading failed:", err);
				continueRender(handle);
			});
	}, [handle, fontFamily]);
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
	useFontLoaded(input.theme.fontFamily);

	const frame = useCurrentFrame();
	const { fps, width, height, durationInFrames } = useVideoConfig();
	const { plan, steps, theme, title, background, windowChrome, showLineNumbers, lineNumberStart, framePadding, cardMargin, transitionMs, loop, typewriter, focusZoom, progressStyle, watermark, audioDataUrl } =
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

	const isTransparent = background === "transparent";
	// Per-step spotlight: mirror the preview's render-time focus so the export matches.
	const focusSets = steps.map((s) => (s.focus && s.focus.length > 0 ? new Set(s.focus) : undefined));
	const typingView = resolveTypingView(input, active, frame, focusSets[0]);
	const view = typingView ?? resolveView(plan, active, frame, focusSets);
	const cursor = typingView?.cursor ?? null;
	const wmColor = getWatermarkColor(background, theme.foreground);
	const backgroundCss = isTransparent ? "transparent" : resolveBackgroundCss(background, frame / fps);

	// Per-step captions overlaid beneath the frame; same timing function as the preview.
	const annotations = steps.map((s) => s.caption ?? "");
	const hasCaptions = annotations.some((a) => a !== "");
	const caption = captionForSegment(active, frame, annotations);

	return (
		<AbsoluteFill style={{ background: backgroundCss }}>
			{/* Synthesized tick track, mounted at frame 0 so it spans the whole video. */}
			{audioDataUrl && <Audio src={audioDataUrl} />}
			{!isTransparent && <GlowDecoration />}
			{!isTransparent && <GrainOverlay />}
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
				caption={
					hasCaptions ? (
						<StepCaption
							text={caption.text}
							opacity={caption.opacity}
							color={wmColor}
							scale={videoScale}
						/>
					) : null
				}
			>
				{/* Focus zoom: identical transform to the preview so the video matches. */}
				<div style={zoomStyle(view.zoom, focusZoom, theme.borderRadius * videoScale)}>
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
						lineNumberColor={`${theme.foreground}30`}
						padding={framePadding * videoScale}
						cursor={cursor}
					/>
				</div>
			</CenteredFrame>
			{watermark && <WatermarkOverlay text={watermark} color={wmColor} fontFamily={theme.fontFamily} />}
		</AbsoluteFill>
	);
}

interface FrameView {
	tokens: ReturnType<typeof renderStatic>;
	lineCount: number;
	lineNumberCount: number;
	/** Cinematic push-in for this frame; identity unless the step has a spotlight. */
	zoom: ZoomTransform;
}

type TypingFrameView = FrameView & { cursor: { line: number; col: number } | null };

/**
 * Transform for the zoom wrapper: overflow-clipped, scaled only when zoom is on.
 * Carries the window's border radius (concentric law) so a scaled, composited
 * layer never squares the window's corners: identical to the browser preview.
 */
function zoomStyle(zoom: ZoomTransform, active: boolean, borderRadius: number): React.CSSProperties {
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

/** Typewriter view for the first hold when typewriter mode is on, else null. */
function resolveTypingView(
	input: RenderInput,
	active: Segment | undefined,
	frame: number,
	focus: Set<number> | undefined,
): TypingFrameView | null {
	if (!input.typewriter || !active || active.type !== "hold" || active.index !== 0 || !input.plan.typing) {
		return null;
	}
	const code = input.steps[0]?.code ?? "";
	const span = active.endFrame - active.startFrame;
	const p = span > 0 ? (frame - active.startFrame) / span : 1;
	const reveal = typedCharCount(code.length, p);
	const { tokens, cursor } = renderTyping(code, input.plan.typing, reveal);
	const lineCount = input.plan.frames[0]?.lineCount ?? 1;
	return { tokens, lineCount, lineNumberCount: lineCount, cursor, zoom: zoomForFocus(focus, lineCount) };
}

function resolveView(
	plan: RenderInput["plan"],
	active: Segment | undefined,
	frame: number,
	focusSets: (Set<number> | undefined)[],
): FrameView {
	if (!active) {
		return { tokens: [], lineCount: 1, lineNumberCount: 1, zoom: NO_ZOOM };
	}
	if (active.type === "transition" || active.type === "loop") {
		const isLoop = active.type === "loop";
		const transition = isLoop ? plan.loopTransition : plan.transitions[active.index];
		const fromFrame = plan.frames[active.index];
		const toFrame = isLoop ? plan.frames[0] : plan.frames[active.index + 1];
		// A loop-back morph runs from the last step to the first.
		const toIndex = isLoop ? 0 : active.index + 1;
		if (transition && fromFrame && toFrame) {
			const span = active.endFrame - active.startFrame;
			const t = span > 0 ? (frame - active.startFrame) / span : 1;
			const eased = easeInOutCubic(Math.min(Math.max(t, 0), 1));
			const fromZoom = zoomForFocus(focusSets[active.index], fromFrame.lineCount);
			const toZoom = zoomForFocus(focusSets[toIndex], toFrame.lineCount);
			return {
				tokens: renderTransition(
					transition.from,
					transition.to,
					t,
					{},
					focusSets[active.index],
					focusSets[toIndex],
				),
				lineCount: fromFrame.lineCount + (toFrame.lineCount - fromFrame.lineCount) * eased,
				lineNumberCount: Math.max(fromFrame.lineCount, toFrame.lineCount),
				zoom: interpolateZoom(fromZoom, toZoom, t, easeInOutCubic),
			};
		}
	}
	const held = plan.frames[active.index] ?? plan.frames[0];
	return staticView(held, focusSets[active.index]);
}

function staticView(held: LaidOutFrame | undefined, focus?: Set<number>): FrameView {
	if (!held) {
		return { tokens: [], lineCount: 1, lineNumberCount: 1, zoom: NO_ZOOM };
	}
	return {
		tokens: renderStatic(held.tokens, focus),
		lineCount: held.lineCount,
		lineNumberCount: held.lineCount,
		zoom: zoomForFocus(focus, held.lineCount),
	};
}

/** Themed card with window chrome, centered and sized to fit the widest line. */
function CenteredFrame({
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
	reels,
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
	reels?: React.ReactNode;
	caption?: React.ReactNode;
	children: React.ReactNode;
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
		hasCaption: caption != null,
		scale: videoScale,
		canvasWidth,
		canvasHeight,
		canvasMargin: CANVAS_MARGIN,
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
						style={{
							width: natural.width,
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
						/>
						{children}
					</div>
					{caption}
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

function WatermarkOverlay({ text, color, fontFamily }: { text: string; color: string; fontFamily: string }) {
	return (
		<div style={{ position: "absolute", bottom: 48, right: 56, fontFamily, fontSize: 22, color }}>{text}</div>
	);
}

function GlowDecoration() {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					width: "70%",
					height: "60%",
					borderRadius: 28,
					background: "radial-gradient(closest-side, rgba(255,255,255,0.05), transparent)",
					filter: "blur(48px)",
				}}
			/>
		</div>
	);
}
