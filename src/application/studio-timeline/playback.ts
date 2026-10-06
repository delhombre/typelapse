/**
 * The studio's playback clock: one canonical duration for the playhead, the
 * readout, the ruler and the export.
 *
 * The scene plan (holds and morphs) says what the code does; the composition
 * (`compileSceneTimeline`) says how long the video lasts, because an audio cue
 * can outlast the last scene. Past the scenes the last frame holds until the
 * audio ends, which is what the multimedia export renders. The loop morph is
 * appended exactly where `video-script.ts` appends it to the file.
 */

import { appendsLoopMorph } from "@/application/export/video-script";
import { buildTimeline } from "@/application/magic-move/timeline";

export type StudioPlaybackPhase = "hold" | "transition" | "loop";

export interface StudioPlaybackSegment {
	type: StudioPlaybackPhase;
	/** Scene held, or the scene a morph leaves (the last scene for the loop). */
	index: number;
	startMs: number;
	endMs: number;
}

export interface StudioPlaybackTimeline {
	segments: StudioPlaybackSegment[];
	/** Where the scenes, their morphs and the loop morph end. */
	scenesEndMs: number;
	/** What the clock counts to and the exported file lasts. */
	totalMs: number;
}

export interface StudioPlaybackInput {
	durations: readonly number[];
	transitionMs: number;
	/** Honoured only where the export honours it; see {@link appendsLoopMorph}. */
	loop: boolean;
	/** The composition's own duration, which carries the audio tail. */
	canonicalMs: number;
}

export interface StudioPlaybackPosition {
	phase: StudioPlaybackPhase;
	index: number;
	/** Progress within the active segment, 0..1. */
	t: number;
	/** Progress across the whole video, 0..1. */
	progress: number;
	/** The clock itself, clamped to the video. */
	elapsedMs: number;
}

export function buildStudioPlayback(input: StudioPlaybackInput): StudioPlaybackTimeline {
	const plan = buildTimeline([...input.durations], input.transitionMs);
	const segments: StudioPlaybackSegment[] = plan.segments.map((segment) => ({ ...segment }));
	let scenesEndMs = plan.totalMs;
	if (appendsLoopMorph(input.loop, input.durations.length)) {
		segments.push({
			type: "loop",
			index: input.durations.length - 1,
			startMs: scenesEndMs,
			endMs: scenesEndMs + input.transitionMs,
		});
		scenesEndMs += input.transitionMs;
	}
	return {
		segments,
		scenesEndMs,
		totalMs: Math.max(scenesEndMs, input.canonicalMs, 0),
	};
}

export function locateStudioPlayback(
	timeline: StudioPlaybackTimeline,
	requestedMs: number,
): StudioPlaybackPosition {
	const elapsedMs = Math.min(Math.max(requestedMs, 0), timeline.totalMs);
	const progress = timeline.totalMs > 0 ? elapsedMs / timeline.totalMs : 0;
	const segment =
		timeline.segments.find((candidate) => elapsedMs < candidate.endMs) ?? timeline.segments.at(-1);
	if (!segment) {
		return { phase: "hold", index: 0, t: 0, progress, elapsedMs };
	}
	const span = segment.endMs - segment.startMs;
	const t = span > 0 ? (elapsedMs - segment.startMs) / span : 1;
	return {
		phase: segment.type,
		index: segment.index,
		t: Math.min(Math.max(t, 0), 1),
		progress,
		elapsedMs,
	};
}

/** The scene on screen: a morph hands over to its destination halfway through. */
export function visibleSceneIndex(
	position: Pick<StudioPlaybackPosition, "phase" | "index" | "t">,
	sceneCount: number,
): number {
	const last = Math.max(sceneCount - 1, 0);
	if (position.phase === "hold" || position.t < 0.5) {
		return Math.min(position.index, last);
	}
	return position.phase === "loop" ? 0 : Math.min(position.index + 1, last);
}

/**
 * D3: one scene is a video, and so is authored media without a captured scene
 * (audio alone). Play and Render ask this one question.
 *
 * With no scene, the live code is the project's only code, so an emptied editor
 * (`emptyLiveCode`) leaves nothing on screen to play or render, media or not.
 */
export function isPlayableProject(
	sceneCount: number,
	hasAuthoredMedia: boolean,
	emptyLiveCode = false,
): boolean {
	if (sceneCount === 0 && emptyLiveCode) {
		return false;
	}
	return sceneCount >= 1 || hasAuthoredMedia;
}
