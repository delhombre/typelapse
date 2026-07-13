import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveBackgroundCss } from "../../src/application/backgrounds/mesh-gradient";
import {
	type LaidOutFrame,
	easeInOutCubic,
	renderStatic,
	renderTransition,
} from "../../src/application/magic-move/engine";
import { renderTyping, typedCharCount } from "../../src/application/magic-move/typewriter";
import { GrainOverlay } from "../../src/presentation/components/preview/grain-overlay";
import { MagicMoveCanvas } from "../../src/presentation/components/preview/magic-move-canvas";
import { ReelsProgress } from "../../src/presentation/components/preview/reels-progress";
import type { RenderInput, ThemeData } from "./types";

/** Upscale factor from the 14px editor preview to crisp 1080p/4K text. */
const VIDEO_SCALE = 2.2;
const LINE_HEIGHT_RATIO = 1.6;
/** Estimated monospace advance as a fraction of the font size (for card width). */
const CHAR_WIDTH_RATIO = 0.62;

function useFontLoaded(fontFamily: string) {
	const [handle] = useState(() => delayRender(`Loading font: ${fontFamily}`));

	useEffect(() => {
		const fontName = fontFamily.split(",")[0]?.trim().replace(/'/g, "") ?? "JetBrains Mono";
		const googleName = fontName.replace(/\s+/g, "+");
		const url = `https://fonts.googleapis.com/css2?family=${googleName}:wght@400;500;700&display=swap`;

		fetch(url)
			.then((res) => res.text())
			.then((css) => {
				const style = document.createElement("style");
				style.textContent = css;
				document.head.appendChild(style);
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
	const { plan, steps, theme, title, background, framePadding, transitionMs, loop, typewriter, progressStyle, watermark } =
		input;

	const segments = buildSegments(
		steps.map((s) => s.duration),
		transitionMs,
		fps,
		loop,
	);
	const active = segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? segments[segments.length - 1];

	const isTransparent = background === "transparent";
	const typingView = resolveTypingView(input, active, frame);
	const view = typingView ?? resolveView(plan, active, frame);
	const cursor = typingView?.cursor ?? null;
	const wmColor = getWatermarkColor(background, theme.foreground);
	const backgroundCss = isTransparent ? "transparent" : resolveBackgroundCss(background, frame / fps);

	return (
		<AbsoluteFill style={{ background: backgroundCss }}>
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
			<CenteredFrame plan={plan} theme={theme} title={title} framePadding={framePadding} canvasWidth={width}>
				<MagicMoveCanvas
					tokens={view.tokens}
					lineCount={view.lineCount}
					lineNumberCount={view.lineNumberCount}
					fontSize={theme.fontSize * VIDEO_SCALE}
					lineHeightRatio={LINE_HEIGHT_RATIO}
					fontFamily={theme.fontFamily}
					color={theme.foreground}
					lineNumberColor={`${theme.foreground}30`}
					padding={framePadding * VIDEO_SCALE}
					cursor={cursor}
				/>
			</CenteredFrame>
			{watermark && <WatermarkOverlay text={watermark} color={wmColor} fontFamily={theme.fontFamily} />}
		</AbsoluteFill>
	);
}

interface FrameView {
	tokens: ReturnType<typeof renderStatic>;
	lineCount: number;
	lineNumberCount: number;
}

type TypingFrameView = FrameView & { cursor: { line: number; col: number } | null };

/** Typewriter view for the first hold when typewriter mode is on, else null. */
function resolveTypingView(
	input: RenderInput,
	active: Segment | undefined,
	frame: number,
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
	return { tokens, lineCount, lineNumberCount: lineCount, cursor };
}

function resolveView(plan: RenderInput["plan"], active: Segment | undefined, frame: number): FrameView {
	if (!active) {
		return { tokens: [], lineCount: 1, lineNumberCount: 1 };
	}
	if (active.type === "transition" || active.type === "loop") {
		const isLoop = active.type === "loop";
		const transition = isLoop ? plan.loopTransition : plan.transitions[active.index];
		const fromFrame = plan.frames[active.index];
		const toFrame = isLoop ? plan.frames[0] : plan.frames[active.index + 1];
		if (transition && fromFrame && toFrame) {
			const span = active.endFrame - active.startFrame;
			const t = span > 0 ? (frame - active.startFrame) / span : 1;
			const eased = easeInOutCubic(Math.min(Math.max(t, 0), 1));
			return {
				tokens: renderTransition(transition.from, transition.to, t),
				lineCount: fromFrame.lineCount + (toFrame.lineCount - fromFrame.lineCount) * eased,
				lineNumberCount: Math.max(fromFrame.lineCount, toFrame.lineCount),
			};
		}
	}
	const held = plan.frames[active.index] ?? plan.frames[0];
	return staticView(held);
}

function staticView(held: LaidOutFrame | undefined): FrameView {
	if (!held) {
		return { tokens: [], lineCount: 1, lineNumberCount: 1 };
	}
	return { tokens: renderStatic(held.tokens), lineCount: held.lineCount, lineNumberCount: held.lineCount };
}

/** Themed card with macOS chrome, centered and sized to fit the widest line. */
function CenteredFrame({
	plan,
	theme,
	title,
	framePadding,
	canvasWidth,
	children,
}: {
	plan: RenderInput["plan"];
	theme: ThemeData;
	title: string;
	framePadding: number;
	canvasWidth: number;
	children: React.ReactNode;
}) {
	const fontSize = theme.fontSize * VIDEO_SCALE;
	const padding = framePadding * VIDEO_SCALE;
	const radius = theme.borderRadius * VIDEO_SCALE;
	const isDark = isColorDark(theme.background);

	const maxCols = widestLine(plan);
	const maxLines = Math.max(1, ...plan.frames.map((f) => f.lineCount));
	const gutterWidth = (String(maxLines).length + 1) * fontSize * CHAR_WIDTH_RATIO + fontSize;
	const codeWidth = (maxCols + 2) * fontSize * CHAR_WIDTH_RATIO;
	// Never exceed the canvas — critical for square/vertical aspect ratios.
	const maxCardWidth = Math.min(1720, canvasWidth * 0.9);
	const cardWidth = Math.min(maxCardWidth, Math.round(padding * 2 + gutterWidth + codeWidth));

	const dot = Math.round(11 * VIDEO_SCALE);
	const boxShadow = isDark
		? "0 0 0 1px rgba(255,255,255,0.05), 0 24px 64px -16px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.4)"
		: "0 0 0 1px rgba(0,0,0,0.06), 0 24px 64px -16px rgba(0,0,0,0.18), 0 8px 24px -8px rgba(0,0,0,0.12)";

	return (
		<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
			<div style={{ width: cardWidth, background: theme.background, borderRadius: radius, overflow: "hidden", boxShadow }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: Math.round(8 * VIDEO_SCALE),
						padding: `${Math.round(13 * VIDEO_SCALE)}px ${Math.round(18 * VIDEO_SCALE)}px`,
						borderBottom: `1px solid ${theme.foreground}12`,
					}}
				>
					<Dot size={dot} color="#ff5f57" />
					<Dot size={dot} color="#febc2e" />
					<Dot size={dot} color="#28c840" />
					{title && (
						<span
							style={{
								marginLeft: Math.round(8 * VIDEO_SCALE),
								fontFamily: theme.fontFamily,
								fontSize: Math.round(11 * VIDEO_SCALE),
								letterSpacing: "-0.02em",
								color: `${theme.foreground}59`,
							}}
						>
							{title}
						</span>
					)}
				</div>
				{children}
			</div>
		</div>
	);
}

function Dot({ size, color }: { size: number; color: string }) {
	return <div style={{ width: size, height: size, borderRadius: "50%", background: color }} />;
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

function getWatermarkColor(background: string, themeForeground: string): string {
	if (background === "transparent") return `${themeForeground}66`;
	const hexMatch = background.match(/#([0-9a-fA-F]{6})/);
	if (!hexMatch?.[1]) return `${themeForeground}66`;
	const hex = hexMatch[1];
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
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
