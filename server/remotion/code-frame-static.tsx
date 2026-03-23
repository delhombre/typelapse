import React from "react";
import type { ThemeData } from "./types";

/**
 * Scale factor for video rendering.
 * Frontend uses 14px fonts for browser display,
 * video at 1920x1080 needs larger text to be readable.
 */
const VIDEO_SCALE = 1.5;

/**
 * Static CodeFrame for Remotion — premium video rendering.
 * All dimensions are scaled for crisp 1080p/4K output.
 */
export function CodeFrameStatic({
	html,
	theme,
	title,
	padding,
	style,
}: {
	html: string;
	theme: ThemeData;
	title: string;
	padding: number;
	style?: React.CSSProperties;
}) {
	const lineCount = countLines(html);
	const isDark = isColorDark(theme.background);

	const fontSize = Math.round(theme.fontSize * VIDEO_SCALE);
	const scaledPadding = Math.round(padding * VIDEO_SCALE);
	const radius = Math.round(theme.borderRadius * VIDEO_SCALE);
	const lineNumberColor = isDark ? `${theme.foreground}25` : `${theme.foreground}20`;

	// Scaled chrome dimensions
	const dotSize = Math.round(14 * VIDEO_SCALE);
	const dotGap = Math.round(8 * VIDEO_SCALE);
	const chromePadX = Math.round(20 * VIDEO_SCALE);
	const chromePadY = Math.round(14 * VIDEO_SCALE);
	const titleFontSize = Math.round(12 * VIDEO_SCALE);

	const boxShadow = isDark
		? [
				"0 0 0 1px rgba(255,255,255,0.04)",
				"0 2px 4px rgba(0,0,0,0.3)",
				"0 8px 24px -4px rgba(0,0,0,0.4)",
				"0 24px 64px -16px rgba(0,0,0,0.5)",
			].join(", ")
		: [
				"0 0 0 1px rgba(0,0,0,0.08)",
				"0 2px 4px rgba(0,0,0,0.06)",
				"0 8px 24px -4px rgba(0,0,0,0.12)",
				"0 24px 64px -16px rgba(0,0,0,0.16)",
			].join(", ");

	return (
		<div
			style={{
				background: theme.background,
				borderRadius: radius,
				overflow: "hidden",
				boxShadow,
				...style,
			}}
		>
			{/* macOS window chrome — scaled for video */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: dotGap,
					padding: `${chromePadY}px ${chromePadX}px`,
					borderBottom: `1px solid ${theme.foreground}08`,
				}}
			>
				<div style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "#ff5f57" }} />
				<div style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "#febc2e" }} />
				<div style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "#28c840" }} />
				{title && (
					<span
						style={{
							marginLeft: dotGap,
							fontFamily: theme.fontFamily,
							fontSize: titleFontSize,
							letterSpacing: "-0.02em",
							color: `${theme.foreground}40`,
						}}
					>
						{title}
					</span>
				)}
			</div>

			{/* Code content with line numbers */}
			<div style={{ display: "flex", padding: `${scaledPadding}px 0` }}>
				{/* Line numbers gutter */}
				<div
					style={{
						flexShrink: 0,
						textAlign: "right",
						fontFamily: theme.fontFamily,
						fontSize,
						lineHeight: "1.6",
						color: lineNumberColor,
						padding: `0 ${Math.round(14 * VIDEO_SCALE)}px 0 ${scaledPadding}px`,
						userSelect: "none",
					}}
				>
					{Array.from({ length: lineCount }, (_, i) => (
						<div key={`ln-${i + 1}`}>{i + 1}</div>
					))}
				</div>

				{/* Code */}
				<div
					style={{
						flex: 1,
						minWidth: 0,
						lineHeight: "1.6",
						color: theme.foreground,
						fontFamily: theme.fontFamily,
						fontSize,
						padding: `0 ${scaledPadding}px 0 0`,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
					}}
					dangerouslySetInnerHTML={{
						__html: resetShikiStyles(html),
					}}
				/>
			</div>
		</div>
	);
}

function resetShikiStyles(html: string): string {
	const cssReset =
		"<style>pre,code{background:transparent!important;background-color:transparent!important;margin:0!important;white-space:pre-wrap!important;word-break:break-word!important;}</style>";

	const cleaned = html
		.replace(
			/<pre[^>]*style="([^"]*)"/g,
			(match, styles: string) =>
				match.replace(
					styles,
					styles
						.replace(/background-color:\s*[^;"]+;?/g, "")
						.replace(/background:\s*[^;"]+;?/g, ""),
				),
		)
		.replace(
			/<code[^>]*style="([^"]*)"/g,
			(match, styles: string) =>
				match.replace(
					styles,
					styles
						.replace(/background-color:\s*[^;"]+;?/g, "")
						.replace(/background:\s*[^;"]+;?/g, ""),
				),
		);

	return cssReset + cleaned;
}

function countLines(html: string): number {
	const stripped = html.replace(/<[^>]*>/g, "");
	return Math.max(stripped.split("\n").length, 1);
}

function isColorDark(color: string): boolean {
	const hex = color.replace("#", "");
	if (hex.length !== 6) return true;
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
