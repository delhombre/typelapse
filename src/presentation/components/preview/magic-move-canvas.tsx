import type { CSSProperties } from "react";
import type { RenderToken } from "../../../application/magic-move/engine";

interface MagicMoveCanvasProps {
	tokens: RenderToken[];
	/** Row count used to size the code area — fractional during a transition. */
	lineCount: number;
	/** Stable number of gutter rows for the whole segment (avoids flicker). */
	lineNumberCount?: number;
	fontSize: number;
	/** Line-height ratio (multiplied by fontSize). */
	lineHeightRatio: number;
	fontFamily: string;
	color: string;
	showLineNumbers?: boolean;
	lineNumberColor?: string;
	padding: number;
	/** Typewriter caret position (line/col), or null to hide it. */
	cursor?: { line: number; col: number } | null;
}

/**
 * Paints a set of already-interpolated tokens on a monospace grid. Each token is
 * absolutely positioned at `col` character-widths (`ch`) across and `line` rows
 * down, so the layout needs no DOM measurement and renders identically in the
 * browser preview and in Remotion's headless Chrome.
 */
export function MagicMoveCanvas({
	tokens,
	lineCount,
	lineNumberCount,
	fontSize,
	lineHeightRatio,
	fontFamily,
	color,
	showLineNumbers = true,
	lineNumberColor,
	padding,
	cursor,
}: MagicMoveCanvasProps) {
	const lineHeight = fontSize * lineHeightRatio;
	const gutterRows = Math.max(1, Math.round(lineNumberCount ?? lineCount));
	const bodyHeight = Math.max(lineHeight, lineCount * lineHeight);

	return (
		<div style={{ display: "flex", padding, fontFamily, fontSize, lineHeight: `${lineHeight}px` }}>
			{showLineNumbers && (
				<div
					aria-hidden="true"
					style={{
						flexShrink: 0,
						textAlign: "right",
						userSelect: "none",
						color: lineNumberColor ?? `${color}33`,
						paddingRight: fontSize,
						minWidth: `${Math.max(2, String(gutterRows).length) + 1}ch`,
					}}
				>
					{Array.from({ length: gutterRows }, (_, i) => (
						<div key={`ln-${i + 1}`} style={{ height: lineHeight }}>
							{String(i + 1).padStart(2, "0")}
						</div>
					))}
				</div>
			)}

			<div style={{ position: "relative", flex: 1, minWidth: 0, height: bodyHeight, color }}>
				{tokens.map((token) => (
					<span key={token.key} style={tokenStyle(token, lineHeight)}>
						{token.content}
					</span>
				))}
				{cursor && (
					<span
						aria-hidden="true"
						style={{
							position: "absolute",
							left: `${cursor.col}ch`,
							top: cursor.line * lineHeight + lineHeight * 0.14,
							width: Math.max(1.5, fontSize * 0.09),
							height: fontSize * 1.05,
							borderRadius: 1,
							background: color,
							opacity: 0.85,
						}}
					/>
				)}
			</div>
		</div>
	);
}

function tokenStyle(token: RenderToken, lineHeight: number): CSSProperties {
	return {
		position: "absolute",
		left: `${token.col}ch`,
		top: token.line * lineHeight,
		opacity: token.opacity,
		color: token.color,
		whiteSpace: "pre",
		fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined,
		fontWeight: token.fontStyle && token.fontStyle & 2 ? 700 : undefined,
		textDecoration: token.fontStyle && token.fontStyle & 4 ? "underline" : undefined,
		willChange: "transform, opacity",
	};
}
