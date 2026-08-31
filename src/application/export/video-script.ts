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
	type GridPosition,
	type LaidOutFrame,
	type MagicMovePlan,
	type RenderToken,
	renderStatic,
	renderTransition,
} from "../magic-move/engine";
import {
	NO_ZOOM,
	type ZoomTransform,
	interpolateZoom,
	zoomForFocus,
} from "../magic-move/focus-zoom";
import { renderTyping, typedCharCount } from "../magic-move/typewriter";

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
	/** The first step's source, which the typewriter reveals a prefix of. */
	firstCode: string;
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
	tokens: RenderToken[];
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
	lineCount: 1,
	lineNumberCount: 1,
	cursor: null,
	zoom: NO_ZOOM,
};

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

	if (input.loop && input.durations.length >= 2) {
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
 * The segment a frame falls in. Zero-length holds exist (a step with duration 0)
 * and must not swallow the frame, hence the strict upper bound; a frame past the
 * end resolves to the last segment so the final image is the finished one.
 */
function locateSegment(segments: ScriptSegment[], frame: number): ScriptSegment | undefined {
	return segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? segments.at(-1);
}

function resolveFrame(
	input: VideoScriptInput,
	active: ScriptSegment | undefined,
	frame: number,
): Omit<ScriptFrame, "progress" | "timeSeconds"> {
	if (!active) {
		return EMPTY;
	}
	return typingFrame(input, active, frame) ?? morphFrame(input, active, frame);
}

/** The first hold, typed out. Only ever the first: later steps morph. */
function typingFrame(
	input: VideoScriptInput,
	active: ScriptSegment,
	frame: number,
): Omit<ScriptFrame, "progress" | "timeSeconds"> | null {
	if (!input.typewriter || active.type !== "hold" || active.index !== 0 || !input.plan.typing) {
		return null;
	}
	const reveal = typedCharCount(input.firstCode.length, spanProgress(active, frame));
	const { tokens, cursor } = renderTyping(input.firstCode, input.plan.typing, reveal);
	const lineCount = input.plan.frames[0]?.lineCount ?? 1;
	return {
		tokens,
		lineCount,
		lineNumberCount: lineCount,
		cursor,
		zoom: zoomForFocus(input.focusSets[0], lineCount),
	};
}

function morphFrame(
	input: VideoScriptInput,
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
	const fromZoom = zoomForFocus(focusSets[active.index], fromFrame.lineCount);
	const toZoom = zoomForFocus(focusSets[toIndex], toFrame.lineCount);
	return {
		tokens: renderTransition(
			transition.from,
			transition.to,
			t,
			{ moveEase },
			focusSets[active.index],
			focusSets[toIndex],
		),
		lineCount: fromFrame.lineCount + (toFrame.lineCount - fromFrame.lineCount) * eased,
		lineNumberCount: Math.max(fromFrame.lineCount, toFrame.lineCount),
		cursor: null,
		zoom: interpolateZoom(fromZoom, toZoom, t, moveEase),
	};
}

function heldFrame(
	held: LaidOutFrame | undefined,
	focus: Set<number> | undefined,
): Omit<ScriptFrame, "progress" | "timeSeconds"> {
	if (!held) {
		return EMPTY;
	}
	return {
		tokens: renderStatic(held.tokens, focus),
		lineCount: held.lineCount,
		lineNumberCount: held.lineCount,
		cursor: null,
		zoom: zoomForFocus(focus, held.lineCount),
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
