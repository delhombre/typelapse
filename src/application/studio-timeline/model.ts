import {
	type StudioPlaybackTimeline,
	buildStudioPlayback,
	locateStudioPlayback,
	visibleSceneIndex,
} from "@/application/studio-timeline/playback";

/** The reference leaves editing room after the sequence instead of ending at the last clip. */
export const MIN_TIMELINE_MS = 12_000;
export const TIMELINE_TAIL_MS = 2_000;
export const MIN_STEP_DURATION_MS = 400;
export const MAX_STEP_DURATION_MS = 10_000;
export const RESIZE_MS_PER_PIXEL = 20;
export const DURATION_SNAP_MS = 100;
const BUBBLE_EDGE_ZONE = 0.025;

export type TimelineBubbleEdge = "start" | "end";

export interface StudioTimelineClip {
	index: number;
	startMs: number;
	endMs: number;
}

export interface StudioTimelineTransition {
	/** Index of the scene the morph leaves; the destination is index + 1. */
	index: number;
	startMs: number;
	endMs: number;
}

export interface StudioTimelineModel {
	clips: StudioTimelineClip[];
	transitions: StudioTimelineTransition[];
	/** The last-to-first morph, when the video ends on one. */
	loop: StudioTimelineTransition | null;
	ticks: number[];
	/** The canonical duration: what the clock counts to and the file lasts. */
	actualDurationMs: number;
	/** Where the scenes (and the loop morph) end; the audio tail may run past it. */
	scenesEndMs: number;
	displayDurationMs: number;
	transitionMs: number;
	durations: readonly number[];
	playback: StudioPlaybackTimeline;
}

/**
 * Build the editing ruler from the same clock the preview plays and the export
 * renders. Without one, the ruler measures the scenes alone.
 */
export function buildStudioTimeline(
	durations: readonly number[],
	transitionMs: number,
	playback: StudioPlaybackTimeline = buildStudioPlayback({
		durations,
		transitionMs,
		loop: false,
		canonicalMs: 0,
	}),
): StudioTimelineModel {
	const clips = playback.segments
		.filter((segment) => segment.type === "hold")
		.map((segment) => ({ index: segment.index, startMs: segment.startMs, endMs: segment.endMs }));
	const transitions = playback.segments
		.filter((segment) => segment.type === "transition")
		.map((segment) => ({ index: segment.index, startMs: segment.startMs, endMs: segment.endMs }));
	const loopSegment = playback.segments.find((segment) => segment.type === "loop");
	const displayDurationMs = Math.max(MIN_TIMELINE_MS, playback.totalMs + TIMELINE_TAIL_MS);
	const lastSecond = Math.ceil(displayDurationMs / 1000);

	return {
		clips,
		transitions,
		loop: loopSegment
			? { index: loopSegment.index, startMs: loopSegment.startMs, endMs: loopSegment.endMs }
			: null,
		ticks: Array.from({ length: lastSecond + 1 }, (_, second) => second),
		actualDurationMs: playback.totalMs,
		scenesEndMs: playback.scenesEndMs,
		displayDurationMs,
		transitionMs,
		durations,
		playback,
	};
}

export function stepProgress(model: StudioTimelineModel, index: number): number {
	const clip = model.clips[index];
	return clip ? clip.startMs / model.displayDurationMs : 0;
}

/** Place actual-film progress on the longer ruler that also contains editing space. */
export function playbackProgressOnRuler(
	model: StudioTimelineModel,
	playbackProgress: number,
): number {
	const safeProgress = Math.min(Math.max(playbackProgress, 0), 1);
	return (safeProgress * model.actualDurationMs) / model.displayDurationMs;
}

/** Resolve a ruler position to the frame that should be visible while paused. */
export function indexAtProgress(model: StudioTimelineModel, progress: number): number {
	if (model.clips.length === 0) {
		return 0;
	}
	const displayTime = Math.min(Math.max(progress, 0), 1) * model.displayDurationMs;
	const elapsed = Math.min(displayTime, model.actualDurationMs);
	return visibleSceneIndex(locateStudioPlayback(model.playback, elapsed), model.clips.length);
}

/** Convert a horizontal resize into a safe persisted duration. */
export function resizeDuration(startDurationMs: number, deltaPx: number): number {
	const raw = startDurationMs + deltaPx * RESIZE_MS_PER_PIXEL;
	const snapped = Math.round(raw / DURATION_SNAP_MS) * DURATION_SNAP_MS;
	return Math.min(Math.max(snapped, MIN_STEP_DURATION_MS), MAX_STEP_DURATION_MS);
}

/** Keep the time pill readable when its centred anchor reaches a ruler edge. */
export function bubbleEdgeAtProgress(progress: number): TimelineBubbleEdge | undefined {
	if (progress <= BUBBLE_EDGE_ZONE) {
		return "start";
	}
	if (progress >= 1 - BUBBLE_EDGE_ZONE) {
		return "end";
	}
	return undefined;
}
