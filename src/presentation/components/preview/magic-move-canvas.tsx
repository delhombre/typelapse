import type { CSSProperties } from "react";
import { FRAME_SECONDARY_ALPHA_HEX } from "../../../application/layout/frame-metrics";
import type { LineClip } from "../../../application/layout/line-clip";
import { scrolledGutter } from "../../../application/line-numbers/gutter";
import type { RenderToken } from "../../../application/magic-move/engine";
import { cellRuns } from "../../../application/text/display-width";

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
	/**
	 * The code row at the window's top (a long file's moved window), fractional
	 * while it scrolls. Tokens arrive on the window's rows; the gutter counts from it.
	 */
	firstRow?: number;
	/**
	 * Where the code column cuts its longest line, from the fit (`lineClip`): the
	 * last columns before the cut are masked to transparent. Absent or null when
	 * every line fits.
	 */
	lineClip?: LineClip | null;
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
	firstRow = 0,
	lineClip,
}: MagicMoveCanvasProps) {
	const lineHeight = fontSize * lineHeightRatio;
	const gutterRows = Math.max(1, Math.round(lineNumberCount ?? lineCount));
	const bodyHeight = Math.max(lineHeight, lineCount * lineHeight);
	// Display-only gutter labels. Focus / highlight ranges stay relative to the
	// snippet's own lines (line 1 = first line) regardless of lineNumberStart, so
	// the gutter offset must never be fed back into focus math.
	const { labels, shift } = scrolledGutter(lineNumberStart, gutterRows, firstRow);
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
							transform: shift > 0 ? `translateY(${-shift * lineHeight}px)` : undefined,
						}}
					>
						{labels.map((label, i) => (
							<div key={`ln-${i + 1}`} style={{ height: lineHeight }}>
								{label}
							</div>
						))}
					</div>
				)}

				<div
					style={{
						position: "relative",
						flex: 1,
						minWidth: 0,
						height: bodyHeight,
						color,
						...lineFadeMask(lineClip),
					}}
				>
					{tokens.map((token) => (
						<span key={token.key} style={tokenStyle(token, lineHeight)}>
							<TokenText content={token.content} />
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

/**
 * The fade over a long line's last columns, as a mask on the code column: the
 * body already cuts the column at its right edge, the window's inner edge, and
 * the mask takes the glyphs from opaque at the fade's first column to
 * transparent at the cut. In `ch`, the unit the tokens are placed in, so the cut
 * lands on the cells the painter fades (`paintLineFade`). The mask moves with
 * the column under the push-in, as the painter's fade does.
 */
function lineFadeMask(clip: LineClip | null | undefined): CSSProperties | undefined {
	if (!clip) {
		return undefined;
	}
	return {
		maskImage: `linear-gradient(to right, #000 ${clip.fadeStart}ch, transparent ${clip.fadeEnd}ch)`,
		maskRepeat: "no-repeat",
	};
}

/**
 * A wide glyph's box: exactly the two cells the engine gives it, the glyph
 * centred inside whatever its fallback face advances (a CJK face is 1em, two
 * cells of JetBrains Mono are 1.2em). Flex centring overflows evenly on both
 * sides, as the painter's centred `fillText` does.
 */
const WIDE_GLYPH: CSSProperties = {
	display: "inline-flex",
	justifyContent: "center",
	width: "2ch",
};

/**
 * A token's text on the engine's cells. Narrow glyphs stay plain text (one `ch`
 * each in a monospace face); each wide glyph gets a two-cell box, so a token
 * holding CJK or emoji ends where the engine says and the next token never
 * paints over it.
 */
function TokenText({ content }: { content: string }) {
	const runs = cellRuns(content);
	if (runs.length <= 1 && !runs[0]?.wide) {
		return <>{content}</>;
	}
	return (
		<>
			{runs.map((run) =>
				run.wide ? (
					<span key={run.col} style={WIDE_GLYPH}>
						{run.text}
					</span>
				) : (
					run.text
				),
			)}
		</>
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
