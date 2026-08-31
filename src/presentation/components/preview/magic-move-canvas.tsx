import type { CSSProperties } from "react";
import { FRAME_SECONDARY_ALPHA_HEX } from "../../../application/layout/frame-metrics";
import { gutterLabels } from "../../../application/line-numbers/gutter";
import type { RenderToken } from "../../../application/magic-move/engine";

interface MagicMoveCanvasProps {
	tokens: RenderToken[];
	/** Row count used to size the code area: fractional during a transition. */
	lineCount: number;
	/** Stable number of gutter rows for the whole segment (avoids flicker). */
	lineNumberCount?: number;
	fontSize: number;
	/** Line-height ratio (multiplied by fontSize). */
	lineHeightRatio: number;
	fontFamily: string;
	color: string;
	showLineNumbers?: boolean;
	/** First gutter number (display-only; focus stays relative to line 1). */
	lineNumberStart?: number;
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
	lineNumberStart = 1,
	lineNumberColor,
	padding,
	cursor,
}: MagicMoveCanvasProps) {
	const lineHeight = fontSize * lineHeightRatio;
	const gutterRows = Math.max(1, Math.round(lineNumberCount ?? lineCount));
	const bodyHeight = Math.max(lineHeight, lineCount * lineHeight);
	// Display-only gutter labels. Focus / highlight ranges stay relative to the
	// snippet's own lines (line 1 = first line) regardless of lineNumberStart, so
	// the gutter offset must never be fed back into focus math.
	const labels = gutterLabels(lineNumberStart, gutterRows);
	const gutterDigits = Math.max(2, labels[labels.length - 1]?.length ?? 2);

	return (
		<div style={{ padding, fontFamily, fontSize, lineHeight: `${lineHeight}px` }}>
			{/* Clip to the interpolated body height so the frame grows and shrinks smoothly
			    through a morph, instead of the line-number gutter snapping it to the tallest
			    frame. Shared by the browser preview and the Remotion video, so both match. */}
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					height: bodyHeight,
					overflow: "hidden",
				}}
			>
				{showLineNumbers && (
					<div
						aria-hidden="true"
						style={{
							flexShrink: 0,
							textAlign: "right",
							userSelect: "none",
							color: lineNumberColor ?? `${color}${FRAME_SECONDARY_ALPHA_HEX}`,
							paddingRight: fontSize,
							minWidth: `${gutterDigits + 1}ch`,
						}}
					>
						{labels.map((label, i) => (
							<div key={`ln-${i + 1}`} style={{ height: lineHeight }}>
								{label}
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
		</div>
	);
}

function tokenStyle(token: RenderToken, lineHeight: number): CSSProperties {
	return {
		position: "absolute",
		// Transform, not left/top. Both are animated every frame for every token
		// while a morph runs, and left/top are layout properties: a Lapse take of
		// the hero reported the tokens animating `top` and the frame animating
		// `height`, with dropped-frame clusters alongside. Transform is composited,
		// so the same motion costs no layout work.
		left: 0,
		top: 0,
		transform: `translate(${token.col}ch, ${token.line * lineHeight}px)`,
		opacity: token.opacity,
		color: token.color,
		whiteSpace: "pre",
		fontStyle: token.fontStyle && token.fontStyle & 1 ? "italic" : undefined,
		fontWeight: token.fontStyle && token.fontStyle & 2 ? 700 : undefined,
		textDecoration: token.fontStyle && token.fontStyle & 4 ? "underline" : undefined,
	};
}
