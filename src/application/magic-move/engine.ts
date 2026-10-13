/**
 * Magic-move animation engine: pure, dependency-free.
 *
 * Given syntax-highlighted tokens for two code frames (with stable keys already
 * assigned by the differ), it computes a deterministic, frame-perfect morph:
 * shared tokens glide to their new position, removed tokens fade out and new
 * tokens fade in. The same engine drives the on-screen preview (via a timer)
 * and the exported video (via Remotion's frame counter), guaranteeing WYSIWYG.
 *
 * Positions are expressed in monospace grid units: `line` (rows) and `col`
 * (display cells, `text/display-width`: a CJK ideograph or an emoji takes two,
 * a combining mark none). Renderers convert them to CSS with `1ch` per cell and
 * a fixed line-height per row, so no DOM measurement is ever required.
 */

import { VISIBLE_COL_LIMIT } from "../layout/canvas-fit";
import { clusters, isNarrowOnly } from "../text/display-width";

/** A highlighted token before layout: `offset` is its index into the frame code. */
export interface RawToken {
	key: string;
	content: string;
	offset: number;
	/** Shiki color, e.g. `#e6edf3`. */
	color?: string;
	/** Shiki FontStyle bitmask: 1 = italic, 2 = bold, 4 = underline. */
	fontStyle?: number;
}

/** A token placed on the monospace grid. */
export interface LaidOutToken {
	key: string;
	content: string;
	line: number;
	col: number;
	color?: string;
	fontStyle?: number;
}

/** A token ready to paint, with interpolated position and opacity. */
export interface RenderToken {
	key: string;
	content: string;
	line: number;
	col: number;
	opacity: number;
	color?: string;
	fontStyle?: number;
}

/** A laid-out code frame, ready to render statically. */
export interface LaidOutFrame {
	tokens: LaidOutToken[];
	lineCount: number;
	/**
	 * The row the plan window starts on, when a long file's window has moved off
	 * the top (`window.ts`). Token lines stay absolute; absent means row 0.
	 */
	firstRow?: number;
}

/** A morph between two adjacent frames with keys synced so shared tokens glide. */
export interface FrameTransition {
	from: LaidOutToken[];
	to: LaidOutToken[];
}

/** A token laid out for typewriter reveal: keeps its start index in the source. */
export interface TypedToken {
	key: string;
	content: string;
	line: number;
	col: number;
	color?: string;
	fontStyle?: number;
	/** Character index of this token's first glyph in the source code. */
	startChar: number;
}

/**
 * Everything a renderer needs to play a timeline: one laid-out frame per step
 * and one transition per adjacent pair. Serializable, so the server can compute
 * it once and hand it to Remotion via inputProps.
 */
export interface MagicMovePlan {
	frames: LaidOutFrame[];
	transitions: FrameTransition[];
	/** Optional morph from the last frame back to the first, for seamless looping. */
	loopTransition?: FrameTransition;
	/** First frame laid out for typewriter intro (keeps whitespace + start indices). */
	typing?: TypedToken[];
}

export interface MagicMoveTiming {
	/** Easing applied to positional moves. Defaults to easeInOutQuart (smooth). */
	moveEase?: (t: number) => number;
	/** Easing applied to the entering fade. Defaults to easeOutCubic. */
	enterEase?: (t: number) => number;
	/** Easing applied to the leaving fade (1 - it is the opacity). Defaults to easeOutCubic. */
	leaveEase?: (t: number) => number;
	/** Progress by which shared tokens have finished gliding. Default 0.62. */
	moveDuration?: number;
	/** Progress by which leaving tokens have fully faded out. Default 0.34. */
	leaveEnd?: number;
	/** Progress at which entering tokens begin to fade in. Default 0.6. */
	enterStart?: number;
	/**
	 * Fraction of the move window spread across moving tokens in reading order,
	 * so they cascade slightly rather than slide in perfect lockstep. Default 0.12.
	 */
	stagger?: number;
}

/**
 * Two-beat timing: existing tokens glide to their final spots first, then the
 * new tokens fade in once the space is clear. This avoids tokens crossing each
 * other mid-transition, which is what reads as "busy" instead of smooth.
 */
const DEFAULT_TIMING: Required<MagicMoveTiming> = {
	moveEase: easeInOutQuart,
	enterEase: easeOutCubic,
	leaveEase: easeOutCubic,
	moveDuration: 0.62,
	leaveEnd: 0.34,
	enterStart: 0.6,
	stagger: 0.12,
};

/**
 * Two frames that share no token (a scene break, #280) have nothing to clear
 * before the new tokens arrive, so the two-beat gap would only show an empty
 * card for a third of the morph. The fades overlap instead: the old frame
 * fades out linearly until 0.6, the new one fades in from 0.4, and the most
 * visible token never drops below about 0.245.
 */
const BREAK_TIMING: MagicMoveTiming = {
	leaveEase: linear,
	leaveEnd: 0.6,
	enterStart: 0.4,
	enterEase: easeOutCubic,
};

function linear(t: number): number {
	return t;
}

/**
 * A spotlight over a frame: the set of 1-indexed line numbers to keep bright.
 * `undefined` (or an empty set) means no focus: every line renders at full
 * opacity, so the engine's output is byte-for-byte what it was before focus.
 */
export type FocusSpec = Set<number> | undefined;

/**
 * Opacity multiplier applied to tokens on lines outside the spotlight.
 *
 * A multiplier, not a colour swap: muted lines keep their syntax hue and lose
 * only presence, so the reader still perceives the shape of the surrounding code
 * instead of a grey slab. 0.25 is the point where, on the dark themes we ship,
 * the unfocused lines stop competing for attention while staying legible enough
 * to give the highlighted band its context; mute them further and the frame
 * reads as a crop; lighter and the emphasis stops landing.
 *
 * Verified against an exported frame: a muted line measures 0.254 of the same
 * line's ink in an otherwise identical render with no spotlight.
 */
export const DIM_OPACITY = 0.25;

/**
 * Dim multiplier for a token on a 0-indexed grid `line` given a focus spec.
 * Grid rows are 0-indexed while the user thinks in 1-indexed line numbers, so a
 * token is bright iff `focus` contains `line + 1`. Fractional lines (a token
 * mid-glide) never reach here: callers evaluate dim at integer endpoints and
 * lerp between them.
 */
function dimFactor(line: number, focus: FocusSpec): number {
	if (!focus || focus.size === 0) {
		return 1;
	}
	return focus.has(Math.round(line) + 1) ? 1 : DIM_OPACITY;
}

export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function easeInOutQuart(t: number): number {
	return t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2;
}

export function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

export function clamp01(value: number): number {
	if (value < 0) {
		return 0;
	}
	if (value > 1) {
		return 1;
	}
	return value;
}

function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}

/**
 * Place tokens on the monospace grid by walking the source once, tracking the
 * visual column in display cells (tabs advance to the next tab stop, wide
 * glyphs two cells). Whitespace-only tokens are
 * dropped: they never paint and only add nodes to animate. So are tokens that
 * start past `VISIBLE_COL_LIMIT`: no canvas can show them at the readable floor,
 * and a 10,000-character line would otherwise animate thousands of them.
 */
export function layoutFrame(code: string, tokens: RawToken[], tabSize = 2): LaidOutToken[] {
	const positions = buildPositionIndex(code, tabSize);
	const result: LaidOutToken[] = [];

	for (const token of tokens) {
		if (isBlank(token.content)) {
			continue;
		}
		const pos = positions[clampIndex(token.offset, positions.length)];
		if (!pos || pos.col >= VISIBLE_COL_LIMIT) {
			continue;
		}
		result.push({
			key: token.key,
			content: token.content,
			line: pos.line,
			col: pos.col,
			color: token.color,
			fontStyle: token.fontStyle,
		});
	}

	return result;
}

/** Number of rows a frame occupies (1-based line count). */
export function frameLineCount(code: string): number {
	let lines = 1;
	for (let i = 0; i < code.length; i++) {
		if (code[i] === "\n") {
			lines++;
		}
	}
	return lines;
}

/**
 * Render a single frame with no animation. Without `focus` every token is fully
 * opaque; with a non-empty focus set, tokens on non-focused lines dim to
 * `DIM_OPACITY` while focused lines stay bright.
 */
export function renderStatic(tokens: LaidOutToken[], focus?: FocusSpec): RenderToken[] {
	return tokens.map((token) => ({ ...token, opacity: dimFactor(token.line, focus) }));
}

/**
 * Interpolate between two laid-out frames at progress `t` (0 → from, 1 → to).
 * Two beats: leaving tokens fade out and shared tokens glide to their final
 * positions first; entering tokens then fade in once the space is clear, so
 * nothing crosses mid-transition. At t=0 the result equals `from`, at t=1 `to`.
 * Two non-empty frames that share no token overlap their fades instead
 * ({@link BREAK_TIMING}): there is no glide to wait for.
 *
 * `fromFocus`/`toFocus` spotlight the source/target frames: the resulting dim
 * factor multiplies each token's enter/leave/glide opacity (it never replaces
 * it). Moving tokens crossfade their dim from origin to destination along the
 * eased move; leaving tokens use `fromFocus`, entering tokens use `toFocus`.
 * Omitting both is identical to the unfocused morph.
 */
export function renderTransition(
	from: LaidOutToken[],
	to: LaidOutToken[],
	t: number,
	timing: MagicMoveTiming = {},
	fromFocus?: FocusSpec,
	toFocus?: FocusSpec,
): RenderToken[] {
	const progress = clamp01(t);
	const fromByKey = new Map(from.map((token) => [token.key, token]));
	const toByKey = new Map(to.map((token) => [token.key, token]));
	const result: RenderToken[] = [];

	const movedCount = from.reduce((n, token) => (toByKey.has(token.key) ? n + 1 : n), 0);
	// Nothing shared and something on both sides: overlap the fades (an explicit
	// timing from the caller still wins).
	const unrelated = movedCount === 0 && from.length > 0 && to.length > 0;
	const { moveEase, enterEase, leaveEase, moveDuration, leaveEnd, enterStart, stagger } = {
		...DEFAULT_TIMING,
		...(unrelated ? BREAK_TIMING : {}),
		...timing,
	};
	let movedIndex = 0;

	// Moved (shared) and leaving tokens.
	for (const token of from) {
		const target = toByKey.get(token.key);
		if (target) {
			const delay = movedCount > 1 ? stagger * (movedIndex / (movedCount - 1)) : 0;
			movedIndex++;
			// Glide finishes by `moveDuration`, staggered by reading order.
			const window = Math.max(0.0001, moveDuration - delay);
			const moveT = moveEase(clamp01((progress - delay) / window));
			// The spotlight crossfades along the same eased move as the position.
			const dim = lerp(dimFactor(token.line, fromFocus), dimFactor(target.line, toFocus), moveT);
			result.push({
				key: token.key,
				content: target.content,
				line: lerp(token.line, target.line, moveT),
				col: lerp(token.col, target.col, moveT),
				opacity: dim,
				color: target.color,
				fontStyle: target.fontStyle,
			});
		} else {
			// Guard leaveEnd against 0 (like the move/enter windows) so a custom
			// timing can't produce 0/0 = NaN opacity.
			const fade = 1 - leaveEase(clamp01(progress / Math.max(0.0001, leaveEnd)));
			result.push({ ...token, opacity: fade * dimFactor(token.line, fromFocus) });
		}
	}

	// Entering tokens: fade in at their final position after the glide.
	for (const token of to) {
		if (fromByKey.has(token.key)) {
			continue;
		}
		const span = Math.max(0.0001, 1 - enterStart);
		const fade = enterEase(clamp01((progress - enterStart) / span));
		result.push({ ...token, opacity: fade * dimFactor(token.line, toFocus) });
	}

	return result;
}

export interface GridPosition {
	line: number;
	col: number;
}

/**
 * Monospace (line, col) for every UTF-16 index in `code` (length + 1 entries).
 * `col` counts display cells; an index inside a glyph maps to the glyph's start.
 */
export function gridPositions(code: string, tabSize = 2): GridPosition[] {
	return buildPositionIndex(code, tabSize);
}

function buildPositionIndex(code: string, tabSize: number): GridPosition[] {
	if (isNarrowOnly(code)) {
		return narrowPositionIndex(code, tabSize);
	}
	const positions: GridPosition[] = new Array(code.length + 1);
	let line = 0;
	let col = 0;
	for (const cluster of clusters(code)) {
		// Every code unit of a glyph (both halves of a surrogate pair, a base and
		// its combining marks) sits where the glyph starts.
		const position = { line, col };
		for (let i = 0; i < cluster.text.length; i++) {
			positions[cluster.start + i] = position;
		}
		if (cluster.text === "\n") {
			line++;
			col = 0;
		} else if (cluster.text === "\t") {
			col += tabSize - (col % tabSize);
		} else {
			col += cluster.width;
		}
	}
	positions[code.length] = { line, col };
	return positions;
}

/** The common case, every code unit one cell: no glyph walk, nothing allocated but positions. */
function narrowPositionIndex(code: string, tabSize: number): GridPosition[] {
	const positions: GridPosition[] = new Array(code.length + 1);
	let line = 0;
	let col = 0;
	for (let i = 0; i < code.length; i++) {
		positions[i] = { line, col };
		const char = code[i];
		if (char === "\n") {
			line++;
			col = 0;
		} else if (char === "\t") {
			col += tabSize - (col % tabSize);
		} else {
			col++;
		}
	}
	positions[code.length] = { line, col };
	return positions;
}

function clampIndex(index: number, length: number): number {
	if (index < 0) {
		return 0;
	}
	if (index >= length) {
		return length - 1;
	}
	return index;
}

function isBlank(content: string): boolean {
	return content.trim().length === 0;
}
