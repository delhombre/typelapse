import React, { useEffect, useState } from "react";
import {
	AbsoluteFill,
	continueRender,
	delayRender,
	interpolate,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import { CodeFrameStatic } from "./code-frame-static";
import type { RenderInput } from "./types";

const TRANSITION_DURATION_S = 0.8;

/**
 * Load JetBrains Mono from Google Fonts so headless Chrome renders
 * the correct monospace font (matches the frontend preview).
 */
const FONT_URL =
	"https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap";

function useFontLoaded() {
	const [handle] = useState(() => delayRender("Loading JetBrains Mono font"));

	useEffect(() => {
		fetch(FONT_URL)
			.then((res) => res.text())
			.then((css) => {
				const style = document.createElement("style");
				style.textContent = css;
				document.head.appendChild(style);
				return document.fonts.ready;
			})
			.then(() => {
				continueRender(handle);
			})
			.catch((err) => {
				console.error("Font loading failed:", err);
				continueRender(handle);
			});
	}, [handle]);
}

export function TypelapseComposition({ input }: { input: RenderInput }) {
	useFontLoaded();

	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const { steps, stepHtmlFrames, theme, title, background, framePadding } = input;

	const transitionFrames = Math.round(TRANSITION_DURATION_S * fps);

	// Build timeline: [hold, transition, hold, transition, ..., hold]
	const segments: {
		type: "hold" | "transition";
		startFrame: number;
		endFrame: number;
		stepIndex: number;
	}[] = [];
	let cursor = 0;

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		if (!step) continue;
		const holdFrames = Math.round((step.duration / 1000) * fps);

		segments.push({
			type: "hold",
			startFrame: cursor,
			endFrame: cursor + holdFrames,
			stepIndex: i,
		});
		cursor += holdFrames;

		if (i < steps.length - 1) {
			segments.push({
				type: "transition",
				startFrame: cursor,
				endFrame: cursor + transitionFrames,
				stepIndex: i,
			});
			cursor += transitionFrames;
		}
	}

	const activeSegment =
		segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ??
		segments[segments.length - 1];

	if (!activeSegment) {
		return <AbsoluteFill style={{ background }} />;
	}

	const isTransparent = background === "transparent";

	// --- HOLD: single frame, no transition ---
	if (activeSegment.type === "hold") {
		const html = stepHtmlFrames[activeSegment.stepIndex] ?? "";
		return (
			<AbsoluteFill style={{ background: isTransparent ? "transparent" : background }}>
				{!isTransparent && <GlowDecoration />}
				<FrameContainer>
					<CodeFrameStatic
						html={html}
						theme={theme}
						title={title}
						padding={framePadding}
					/>
				</FrameContainer>
			</AbsoluteFill>
		);
	}

	// --- TRANSITION: opacity + translateY (inspired by Snipcast) ---
	const t = interpolate(
		frame,
		[activeSegment.startFrame, activeSegment.endFrame],
		[0, 1],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	);

	const eased = easeInOutCubic(t);
	const htmlFrom = stepHtmlFrames[activeSegment.stepIndex] ?? "";
	const htmlTo = stepHtmlFrames[activeSegment.stepIndex + 1] ?? "";

	// Outgoing: fade out + slide up
	const outOpacity = 1 - eased;
	const outY = -10 * eased;

	// Incoming: fade in + slide up from below
	const inOpacity = eased;
	const inY = 10 * (1 - eased);

	return (
		<AbsoluteFill style={{ background: isTransparent ? "transparent" : background }}>
			{!isTransparent && <GlowDecoration />}

			{/* Outgoing step */}
			<FrameContainer>
				<CodeFrameStatic
					html={htmlFrom}
					theme={theme}
					title={title}
					padding={framePadding}
					style={{
						opacity: outOpacity,
						transform: `translateY(${outY}px)`,
					}}
				/>
			</FrameContainer>

			{/* Incoming step */}
			<FrameContainer>
				<CodeFrameStatic
					html={htmlTo}
					theme={theme}
					title={title}
					padding={framePadding}
					style={{
						opacity: inOpacity,
						transform: `translateY(${inY}px)`,
					}}
				/>
			</FrameContainer>
		</AbsoluteFill>
	);
}

/**
 * Subtle radial glow behind the code frame card.
 * Adds depth and a premium feel (inspired by Snipcast).
 */
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
					background: "radial-gradient(closest-side, rgba(255,255,255,0.04), transparent)",
					filter: "blur(48px)",
				}}
			/>
		</div>
	);
}

/**
 * Centers the code frame within the video canvas.
 * 28px padding, maxWidth 1600px (Snipcast reference).
 */
function FrameContainer({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 28,
			}}
		>
			<div style={{ width: "98%", maxWidth: 1600 }}>{children}</div>
		</div>
	);
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
