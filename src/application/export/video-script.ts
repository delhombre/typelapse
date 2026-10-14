/**
 * The whole video as a function of a frame number.
 *
 * The preview resolves what to paint from a wall clock, and the Remotion
 * composition resolves it from `useCurrentFrame`; both walk the same segments
 * and call the same three engine functions, but each keeps its own copy of the
 * walk. A canvas renderer needs a third copy — which is one copy too many, so
 * this is the walk itself, extracted: give it a plan and the export's settings
 * and it hands back every frame of the finished video, in order, as data.
 *
 * Segment arithmetic is the composition's, in whole frames rather than
 * milliseconds, because that is what an encoder steps through and what the
 * shipped export already uses. Everything else — the eased body height, the
 * gutter held at the taller frame, the focus dim, the push-in, the typewriter's
 * first hold — is the preview's behaviour, reproduced rather than approximated.
 */

import { type CubicBezier, DEFAULT_TRANSITION_EASING, cubicBezierAt } from "../magic-move/easing";
import {
	BREAK_ENTER_START,
	BREAK_OUT_END,
	type GridPosition,
	type LaidOutFrame,
	type MagicMovePlan,
	type RenderToken,
	isSceneBreak,
	renderStatic,
	renderTransition,
} from "../magic-move/engine";
import {
	NO_ZOOM,
	type ZoomTransform,
	interpolateZoom,
	zoomForFocus,
} from "../magic-move/focus-zoom";
import {
	keystrokeCount,
	renderTyping,
	typedCharCount,
	typingProgressAt,
} from "../magic-move/typewriter";
import { frameFirstRow, scrollRows } from "../magic-move/window";

export interface VideoScriptInput {
	plan: MagicMovePlan;
	/** Hold duration of each step, in milliseconds. */
	durations: readonly number[];
	/** Morph tempo between two steps, in milliseconds. */
	transitionMs: number;
	/** Positional morph curve; old jobs keep the previous symmetric default. */
	transitionEasing?: CubicBezier;
	fps: number;
	/** Append a last→first morph so a looping player never hard-cuts. */
	loop: boolean;
	/** Type the first step out character by character. */
	typewriter: boolean;
	/** The typed scene's source, which the typewriter reveals a prefix of. */
	firstCode: string;
	/** The scene the typewriter types (`typingHoldIndex`): the first with code. */
	typingIndex?: number;
	/** Per-step spotlight (1-indexed line numbers), index-aligned with `durations`. */
	focusSets: readonly (Set<number> | undefined)[];
}

export type SegmentType = "hold" | "transition" | "loop";

export interface ScriptSegment {
	type: SegmentType;
	/** Step this segment belongs to; a transition runs from `index` to `index + 1`. */
	index: number;
	startFrame: number;
	endFrame: number;
}

/** Everything a painter needs for one frame, and nothing it has to compute. */
export interface ScriptFrame {
	/** Tokens on the rows of the window, whose top is `firstRow`. */
	tokens: RenderToken[];
	/**
	 * The row of the code at the window's top: 0 unless a long file's window
	 * moved down (`magic-move/window`), fractional while it scrolls in a morph.
	 */
	firstRow: number;
	/** Rows the code area is clipped to; fractional through a morph. */
	lineCount: number;
	/** Rows the gutter shows; held at the taller frame so it cannot flicker. */
	lineNumberCount: number;
	/** Typewriter caret, or null when nothing is being typed. */
	cursor: GridPosition | null;
	zoom: ZoomTransform;
	/** Position in the whole video, 0..1: what the baked progress bar shows. */
	progress: number;
	/** Seconds since the first frame: what the mesh drift is a function of. */
	timeSeconds: number;
}

export interface VideoScript {
	segments: ScriptSegment[];
	totalFrames: number;
	fps: number;
	frameAt(frame: number): ScriptFrame;
}

const EMPTY: Omit<ScriptFrame, "progress" | "timeSeconds"> = {
	tokens: [],
	firstRow: 0,
	lineCount: 1,
	lineNumberCount: 1,
	cursor: null,
	zoom: NO_ZOOM,
};

/** The inputs a single frame depends on: everything but the clock. */
export type ScriptFrameInput = Pick<
	VideoScriptInput,
	"plan" | "transitionEasing" | "typewriter" | "firstCode" | "typingIndex" | "focusSets"
>;

/** A position in the video as the preview's clock reports it. */
export interface ScriptPosition {
	phase: SegmentType;
	index: number;
	/** Progress within the segment, 0..1. */
	t: number;
}

/**
 * The frame at a playback position. The preview's clock speaks in segments and
 * local progress rather than whole frames; it resolves through the same walk
 * as the file, so a hold, a morph and the loop morph look the same in both.
 */
export function scriptFrameAt(
	input: ScriptFrameInput,
	position: ScriptPosition,
): Omit<ScriptFrame, "progress" | "timeSeconds"> {
	const segment: ScriptSegment = {
		type: position.phase,
		index: position.index,
		startFrame: 0,
		endFrame: POSITION_SPAN,
	};
	return resolveFrame(input, segment, Math.min(Math.max(position.t, 0), 1) * POSITION_SPAN);
}

/** Resolution of a position's local progress, as if its segment were this many frames. */
const POSITION_SPAN = 1_000_000;

export function videoScript(input: VideoScriptInput): VideoScript {
	const segments = buildSegments(input);
	const totalFrames = Math.max(1, segments.at(-1)?.endFrame ?? 1);

	return {
		segments,
		totalFrames,
		fps: input.fps,
		frameAt(frame: number): ScriptFrame {
			const clamped = Math.min(Math.max(Math.floor(frame), 0), totalFrames - 1);
			const active = locateSegment(segments, clamped);
			return {
				...resolveFrame(input, active, clamped),
				progress: clamped / totalFrames,
				timeSeconds: clamped / input.fps,
			};
		},
	};
}

/**
 * Hold, morph, hold… in whole frames. Rounding each span independently (rather
 * than rounding a running total) is what the shipped composition does, so a
 * client-side export lands on the same frame boundaries as a hosted one.
 */
function buildSegments(input: VideoScriptInput): ScriptSegment[] {
	const segments: ScriptSegment[] = [];
	const transitionFrames = Math.round((input.transitionMs / 1000) * input.fps);
	let cursor = 0;

	for (let i = 0; i < input.durations.length; i++) {
		const holdFrames = Math.round(((input.durations[i] ?? 0) / 1000) * input.fps);
		segments.push({ type: "hold", index: i, startFrame: cursor, endFrame: cursor + holdFrames });
		cursor += holdFrames;
		if (i < input.durations.length - 1) {
			segments.push({
				type: "transition",
				index: i,
				startFrame: cursor,
				endFrame: cursor + transitionFrames,
			});
			cursor += transitionFrames;
		}
	}

	if (appendsLoopMorph(input.loop, input.durations.length)) {
		segments.push({
			type: "loop",
			index: input.durations.length - 1,
			startFrame: cursor,
			endFrame: cursor + transitionFrames,
		});
	}

	return segments;
}

/**
 * Whether the video ends on a last-to-first morph. One scene has nothing to
 * morph back to. The studio's playback clock asks the same question, so the
 * preview and the file cannot disagree on the loop.
 */
export function appendsLoopMorph(loop: boolean, sceneCount: number): boolean {
	return loop && sceneCount >= 2;
}

/**
 * The segment a frame falls in. Zero-length holds exist (a step with duration 0)
 * and must not swallow the frame, hence the strict upper bound; a frame past the
 * end resolves to the last segment so the final image is the finished one.
 */
function locateSegment(segments: ScriptSegment[], frame: number): ScriptSegment | undefined {
	return segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? segments.at(-1);
}

function resolveFrame(
	input: ScriptFrameInput,
	active: ScriptSegment | undefined,
	frame: number,
): Omit<ScriptFrame, "progress" | "timeSeconds"> {
	if (!active) {
		return EMPTY;
	}
	return typingFrame(input, active, frame) ?? morphFrame(input, active, frame);
}

/** The typed scene's hold, typed out, and an empty window before it; later steps morph. */
function typingFrame(
	input: ScriptFrameInput,
	active: ScriptSegment,
	frame: number,
): Omit<ScriptFrame, "progress" | "timeSeconds"> | null {
	const holdIndex = input.typingIndex ?? 0;
	const progress = typingProgressAt(
		{ phase: active.type, index: active.index, t: spanProgress(active, frame) },
		holdIndex,
	);
	if (!input.typewriter || progress === null || !input.plan.typing) {
		return null;
	}
	const reveal = typedCharCount(keystrokeCount(input.firstCode), progress);
	const { tokens, cursor } = renderTyping(input.firstCode, input.plan.typing, reveal);
	const held = input.plan.frames[holdIndex];
	const lineCount = held?.lineCount ?? 1;
	const firstRow = frameFirstRow(held);
	return {
		tokens: scrollRows(tokens, firstRow),
		firstRow,
		lineCount,
		lineNumberCount: lineCount,
		cursor: cursor && firstRow > 0 ? { ...cursor, line: cursor.line - firstRow } : cursor,
		zoom: zoomForFocus(input.focusSets[holdIndex], lineCount, firstRow),
	};
}

function morphFrame(
	input: ScriptFrameInput,
	active: ScriptSegment,
	frame: number,
): Omit<ScriptFrame, "progress" | "timeSeconds"> {
	const { plan, focusSets } = input;
	if (active.type === "hold") {
		return heldFrame(plan.frames[active.index], focusSets[active.index]);
	}

	const isLoop = active.type === "loop";
	const transition = isLoop ? plan.loopTransition : plan.transitions[active.index];
	const fromFrame = plan.frames[active.index];
	const toIndex = isLoop ? 0 : active.index + 1;
	const toFrame = plan.frames[toIndex];
	if (!transition || !fromFrame || !toFrame) {
		return heldFrame(fromFrame, focusSets[active.index]);
	}

	const t = spanProgress(active, frame);
	const easing = input.transitionEasing ?? DEFAULT_TRANSITION_EASING;
	const moveEase = (progress: number) => cubicBezierAt(easing, progress);
	const eased = moveEase(t);
	const fromRow = frameFirstRow(fromFrame);
	const toRow = frameFirstRow(toFrame);
	const broken = isSceneBreak(transition.from, transition.to);
	// A morph scrolls the window on the same curve the card grows and pushes in
	// on. Across a break nothing is shared, so nothing scrolls: the outgoing
	// window holds until its side has faded, then the incoming one takes over.
	const firstRow = broken ? breakFirstRow(t, fromRow, toRow) : fromRow + (toRow - fromRow) * eased;
	const fromZoom = zoomForFocus(focusSets[active.index], fromFrame.lineCount, fromRow);
	const toZoom = zoomForFocus(focusSets[toIndex], toFrame.lineCount, toRow);
	const rendered = renderTransition(
		transition.from,
		transition.to,
		t,
		{ moveEase },
		focusSets[active.index],
		focusSets[toIndex],
	);
	return {
		tokens: broken
			? scrollBrokenRows(rendered, transition.from, fromRow, toRow)
			: scrollRows(rendered, firstRow),
		firstRow,
		lineCount: fromFrame.lineCount + (toFrame.lineCount - fromFrame.lineCount) * eased,
		lineNumberCount: Math.max(fromFrame.lineCount, toFrame.lineCount),
		cursor: null,
		zoom: interpolateZoom(fromZoom, toZoom, broken ? breakZoomProgress(t) : t, moveEase),
	};
}

/**
 * How far the push-in has travelled. A morph carries it over the whole
 * transition; across a break the camera settles before the incoming page
 * enters (`BREAK_ENTER_START`), so the page appears at its final zoom and no
 * pull-back plays under two unrelated pages dissolving (#330).
 */
function breakZoomProgress(t: number): number {
	return Math.min(t / BREAK_ENTER_START, 1);
}

/** The window a break shows: the outgoing one until its side has faded. */
function breakFirstRow(t: number, fromRow: number, toRow: number): number {
	return t < BREAK_OUT_END ? fromRow : toRow;
}

/**
 * The tokens of a break, each on its own side's window: the incoming ones fade
 * in (from 0.4) before the outgoing ones are gone (0.6), so one scroll for the
 * whole frame would shove one side off the card.
 */
function scrollBrokenRows(
	tokens: RenderToken[],
	outgoing: readonly { key: string }[],
	fromRow: number,
	toRow: number,
): RenderToken[] {
	const out = new Set(outgoing.map((token) => token.key));
	return tokens.map((token) => ({
		...token,
		line: token.line - (out.has(token.key) ? fromRow : toRow),
	}));
}

function heldFrame(
	held: LaidOutFrame | undefined,
	focus: Set<number> | undefined,
): Omit<ScriptFrame, "progress" | "timeSeconds"> {
	if (!held) {
		return EMPTY;
	}
	const firstRow = frameFirstRow(held);
	return {
		tokens: scrollRows(renderStatic(held.tokens, focus), firstRow),
		firstRow,
		lineCount: held.lineCount,
		lineNumberCount: held.lineCount,
		cursor: null,
		zoom: zoomForFocus(focus, held.lineCount, firstRow),
	};
}

/** How far into its own segment a frame sits, 0..1. */
function spanProgress(active: ScriptSegment, frame: number): number {
	const span = active.endFrame - active.startFrame;
	if (span <= 0) {
		return 1;
	}
	return Math.min(Math.max((frame - active.startFrame) / span, 0), 1);
}
