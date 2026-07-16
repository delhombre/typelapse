import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveBackgroundCss } from "../../src/application/backgrounds/mesh-gradient";
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

/** Upscale factor from the 14px editor preview to crisp 1080p/4K text. */
const VIDEO_SCALE = 2.2;
const LINE_HEIGHT_RATIO = 1.6;
/** Estimated monospace advance as a fraction of the font size (for card width). */
const CHAR_WIDTH_RATIO = 0.62;

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
	const { fps, width, durationInFrames } = useVideoConfig();
	const { plan, steps, theme, title, background, windowChrome, showLineNumbers, lineNumberStart, framePadding, transitionMs, loop, typewriter, focusZoom, progressStyle, watermark, audioDataUrl } =
		input;

	const segments = buildSegments(
		steps.map((s) => s.duration),
		transitionMs,
		fps,
		loop,
	);
	const active = segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? segments[segments.length - 1];

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
			{steps.length >= 2 && (
				<ReelsProgress
					style={progressStyle}
					segments={steps.length}
					progress={frame / Math.max(1, durationInFrames)}
					scale={VIDEO_SCALE}
				/>
			)}
			<CenteredFrame
				plan={plan}
				theme={theme}
				title={title}
				windowChrome={windowChrome}
				showLineNumbers={showLineNumbers}
				lineNumberStart={lineNumberStart}
				framePadding={framePadding}
				canvasWidth={width}
				caption={
					hasCaptions ? (
						<StepCaption
							text={caption.text}
							opacity={caption.opacity}
							color={wmColor}
							scale={VIDEO_SCALE}
						/>
					) : null
				}
			>
				{/* Focus zoom — identical transform to the preview so the video matches. */}
				<div style={zoomStyle(view.zoom, focusZoom)}>
					<MagicMoveCanvas
						tokens={view.tokens}
						lineCount={view.lineCount}
						lineNumberCount={view.lineNumberCount}
						fontSize={theme.fontSize * VIDEO_SCALE}
						lineHeightRatio={LINE_HEIGHT_RATIO}
						fontFamily={theme.fontFamily}
						color={theme.foreground}
						showLineNumbers={showLineNumbers}
						lineNumberStart={lineNumberStart}
						lineNumberColor={`${theme.foreground}30`}
						padding={framePadding * VIDEO_SCALE}
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

/** Transform for the zoom wrapper: overflow-clipped, scaled only when zoom is on. */
function zoomStyle(zoom: ZoomTransform, active: boolean): React.CSSProperties {
	if (!active) {
		return { overflow: "hidden" };
	}
	return {
		overflow: "hidden",
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
	canvasWidth,
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
	canvasWidth: number;
	caption?: React.ReactNode;
	children: React.ReactNode;
}) {
	const fontSize = theme.fontSize * VIDEO_SCALE;
	const padding = framePadding * VIDEO_SCALE;
	const radius = theme.borderRadius * VIDEO_SCALE;
	const isDark = isColorDark(theme.background);

	const maxCols = widestLine(plan);
	const maxLines = Math.max(1, ...plan.frames.map((f) => f.lineCount));
	// Widest rendered gutter number decides the gutter width; hidden gutter = 0.
	const maxLineNo = Math.max(1, Math.floor(lineNumberStart)) + maxLines - 1;
	const gutterDigits = Math.max(2, String(maxLineNo).length);
	const gutterWidth = showLineNumbers ? (gutterDigits + 1) * fontSize * CHAR_WIDTH_RATIO + fontSize : 0;
	const codeWidth = (maxCols + 2) * fontSize * CHAR_WIDTH_RATIO;
	// Never exceed the canvas — critical for square/vertical aspect ratios.
	const maxCardWidth = Math.min(1720, canvasWidth * 0.9);
	const cardWidth = Math.min(maxCardWidth, Math.round(padding * 2 + gutterWidth + codeWidth));

	const boxShadow = isDark
		? "0 0 0 1px rgba(255,255,255,0.05), 0 24px 64px -16px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.4)"
		: "0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px -16px rgba(0,0,0,0.18), 0 8px 24px -8px rgba(0,0,0,0.12)";

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<div style={{ width: cardWidth, background: theme.background, borderRadius: radius, overflow: "hidden", boxShadow }}>
				<FrameChrome
					chrome={windowChrome}
					title={title}
					foreground={theme.foreground}
					scale={VIDEO_SCALE}
				/>
				{children}
			</div>
			{caption}
		</div>
	);
}

function widestLine(plan: RenderInput["plan"]): number {
	let max = 0;
	for (const frame of plan.frames) {
		for (const token of frame.tokens) {
			max = Math.max(max, token.col + token.content.length);
		}
	}
	return max;
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
