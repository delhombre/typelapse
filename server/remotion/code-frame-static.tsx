import React from "react";
import type { ThemeData } from "./types";

/**
 * Scale factor for video rendering.
 * Frontend uses small font sizes (14px) for browser display,
 * but video at 1920x1080 needs larger text to be readable.
 * A competing tool reference: 20px font / 30px line-height at 1920x1080.
 */
const VIDEO_SCALE = 1.5;

/**
 * Static CodeFrame for Remotion — premium video rendering.
 * Inspired by A competing tool's visual quality: gradient card, deep shadows,
 * dark header overlay, generous spacing.
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

	// Scale sizes for video
	const fontSize = Math.round(theme.fontSize * VIDEO_SCALE);
	const scaledPadding = Math.round(padding * VIDEO_SCALE);
	const lineNumberColor = isDark ? `${theme.foreground}25` : `${theme.foreground}20`;

	// Match frontend CodeFrame: flat background + layered shadows
	const boxShadow = isDark
		? [
				"0 0 0 1px rgba(255,255,255,0.04)",
				"0 1px 2px rgba(0,0,0,0.3)",
				"0 4px 12px -2px rgba(0,0,0,0.4)",
				"0 12px 36px -8px rgba(0,0,0,0.5)",
				"0 24px 60px -12px rgba(0,0,0,0.35)",
			].join(", ")
		: [
				"0 0 0 1px rgba(0,0,0,0.08)",
				"0 1px 2px rgba(0,0,0,0.06)",
				"0 4px 12px -2px rgba(0,0,0,0.12)",
				"0 12px 36px -8px rgba(0,0,0,0.16)",
				"0 24px 60px -12px rgba(0,0,0,0.1)",
			].join(", ");

	return (
		<div
			style={{
				background: theme.background,
				borderRadius: 12,
				overflow: "hidden",
				boxShadow,
				...style,
			}}
		>
			{/* macOS window chrome — matches frontend CodeFrame exactly */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "12px 16px",
					borderBottom: `1px solid ${theme.foreground}08`,
				}}
			>
				<div style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
				<div style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
				<div style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
				{title && (
					<span
						style={{
							marginLeft: 8,
							fontFamily: theme.fontFamily,
							fontSize: 11,
							letterSpacing: "-0.02em",
							color: `${theme.foreground}35`,
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
						lineHeight: "1.5",
						color: lineNumberColor,
						padding: `0 14px 0 ${scaledPadding}px`,
						userSelect: "none",
					}}
				>
					{Array.from({ length: lineCount }, (_, i) => (
						<div key={`ln-${i + 1}`}>{i + 1}</div>
					))}
				</div>

				{/* Code — reset Shiki backgrounds so card gradient shows through */}
				<div
					style={{
						flex: 1,
						minWidth: 0,
						lineHeight: "1.5",
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

/**
 * Strip ALL Shiki background styles on <pre> and <code>, and inject
 * a <style> tag with !important overrides (same approach as frontend Tailwind).
 */
function resetShikiStyles(html: string): string {
	const cssReset = `<style>pre,code{background:transparent!important;background-color:transparent!important;margin:0!important;white-space:pre-wrap!important;word-break:break-word!important;}</style>`;

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
