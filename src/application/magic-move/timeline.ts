/**
 * Playback timeline — pure segment math shared by the preview driver and the
 * video renderer so both play the exact same sequence of holds and morphs.
 */

/** Default morph duration between two steps, in milliseconds. */
export const TRANSITION_MS = 650;

export interface TimelineSegment {
	type: "hold" | "transition";
	/** Index of the step being held, or the "from" step of a transition. */
	index: number;
	startMs: number;
	endMs: number;
}

export interface Timeline {
	segments: TimelineSegment[];
	totalMs: number;
}

export interface PlaybackPosition {
	phase: "hold" | "transition";
	/** Step being held, or the "from" step of the active transition. */
	index: number;
	/** Local progress within a transition (0..1); always 0 while holding. */
	t: number;
	/** Overall progress across the whole timeline (0..1). */
	progress: number;
}

/**
 * Build the hold/transition segments for a list of step durations. Transitions
 * are inserted between consecutive steps only, never after the last one.
 */
export function buildTimeline(durations: number[], transitionMs = TRANSITION_MS): Timeline {
	const segments: TimelineSegment[] = [];
	let cursor = 0;

	for (let i = 0; i < durations.length; i++) {
		const hold = Math.max(0, durations[i] ?? 0);
		segments.push({ type: "hold", index: i, startMs: cursor, endMs: cursor + hold });
		cursor += hold;

		if (i < durations.length - 1) {
			segments.push({
				type: "transition",
				index: i,
				startMs: cursor,
				endMs: cursor + transitionMs,
			});
			cursor += transitionMs;
		}
	}

	return { segments, totalMs: cursor };
}

/** Resolve the playback position at a given elapsed time. */
export function locate(timeline: Timeline, elapsedMs: number): PlaybackPosition {
	const { segments, totalMs } = timeline;
	const clamped = Math.min(Math.max(elapsedMs, 0), totalMs);
	const progress = totalMs > 0 ? clamped / totalMs : 0;

	for (const segment of segments) {
		if (clamped < segment.endMs || segment === segments[segments.length - 1]) {
			const span = segment.endMs - segment.startMs;
			const local = span > 0 ? (clamped - segment.startMs) / span : segment.type === "hold" ? 0 : 1;
			// `t` is the local progress within the segment (used by transitions, and
			// by the typewriter intro to know how far into the first hold we are).
			return {
				phase: segment.type,
				index: segment.index,
				t: Math.min(Math.max(local, 0), 1),
				progress,
			};
		}
	}

	return { phase: "hold", index: 0, t: 0, progress: 0 };
}
