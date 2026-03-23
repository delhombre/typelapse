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

export function TypelapseComposition({ input }: { input: RenderInput }) {
	useFontLoaded(input.theme.fontFamily);

	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const {
		steps,
		stepHtmlFrames,
		transitionDurationFrames,
		theme,
		title,
		background,
		framePadding,
		watermark,
	} = input;

	// Build timeline
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
				endFrame: cursor + transitionDurationFrames,
				stepIndex: i,
			});
			cursor += transitionDurationFrames;
		}
	}

	const activeSegment =
		segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ??
		segments[segments.length - 1];

	if (!activeSegment) {
		return <AbsoluteFill style={{ background }} />;
	}

	const isTransparent = background === "transparent";
	const bgStyle = isTransparent ? "transparent" : background;
	const wmColor = getWatermarkColor(background, theme.foreground);

	// --- HOLD ---
	if (activeSegment.type === "hold") {
		const html = stepHtmlFrames[activeSegment.stepIndex] ?? "";
		return (
			<AbsoluteFill style={{ background: bgStyle }}>
				{!isTransparent && <GlowDecoration />}
				<FrameContainer>
					<CodeFrameStatic html={html} theme={theme} title={title} padding={framePadding} />
				</FrameContainer>
				{watermark && (
					<WatermarkOverlay text={watermark} color={wmColor} fontFamily={theme.fontFamily} />
				)}
			</AbsoluteFill>
		);
	}

	// --- TRANSITION: clean crossfade ---
	const fromHtml = stepHtmlFrames[activeSegment.stepIndex] ?? "";
	const toHtml = stepHtmlFrames[activeSegment.stepIndex + 1] ?? "";

	const progress = interpolate(
		frame - activeSegment.startFrame,
		[0, transitionDurationFrames],
		[0, 1],
		{ extrapolateRight: "clamp" },
	);
	const eased = easeInOutCubic(progress);

	return (
		<AbsoluteFill style={{ background: bgStyle }}>
			{!isTransparent && <GlowDecoration />}
			<FrameContainer>
				<div style={{ display: "grid" }}>
					{/* From — fading out */}
					<div style={{ gridArea: "1/1", opacity: 1 - eased }}>
						<CodeFrameStatic html={fromHtml} theme={theme} title={title} padding={framePadding} />
					</div>
					{/* To — fading in */}
					<div style={{ gridArea: "1/1", opacity: eased }}>
						<CodeFrameStatic html={toHtml} theme={theme} title={title} padding={framePadding} />
					</div>
				</div>
			</FrameContainer>
			{watermark && (
				<WatermarkOverlay text={watermark} color={wmColor} fontFamily={theme.fontFamily} />
			)}
		</AbsoluteFill>
	);
}

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function getWatermarkColor(background: string, themeForeground: string): string {
	if (background === "transparent") return `${themeForeground}66`;
	const hexMatch = background.match(/#([0-9a-fA-F]{6})/);
	if (!hexMatch?.[1]) return `${themeForeground}66`;
	const hex = hexMatch[1];
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
}

function WatermarkOverlay({
	text,
	color,
	fontFamily,
}: { text: string; color: string; fontFamily: string }) {
	return (
		<div
			style={{
				position: "absolute",
				bottom: 48,
				right: 56,
				fontFamily,
				fontSize: 18,
				color,
			}}
		>
			{text}
		</div>
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
					background: "radial-gradient(closest-side, rgba(255,255,255,0.04), transparent)",
					filter: "blur(48px)",
				}}
			/>
		</div>
	);
}

function FrameContainer({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 48,
			}}
		>
			<div style={{ width: "90%", maxWidth: 1600 }}>{children}</div>
		</div>
	);
}
