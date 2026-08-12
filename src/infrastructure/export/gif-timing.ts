/**
 * GIF cannot hold an arbitrary frame rate, and pretending otherwise is how an
 * exported GIF ends up a different length from the video beside it.
 *
 * The format spends per-frame delays in whole centiseconds, so 30 fps is 3.33
 * of them and 60 fps is 1.67. Two things follow, and both are arithmetic rather
 * than opinion: a rate above 50 has to come down (below two centisecondes most
 * decoders quietly substitute a tenth of a second, which plays back *slower*
 * than 50 fps would), and the fractional remainder has to be carried from frame
 * to frame instead of rounded away, or a ten-second GIF finishes at nine.
 */

/** The fastest GIF the format can actually deliver, at or below the ask. */
export function gifSafeFps(fps: number): number {
	return Math.max(1, Math.min(Math.floor(fps) || 1, 50));
}

/**
 * Per-frame delays in centiseconds, carrying the remainder so the running total
 * is the exact duration at every frame, not just on average.
 */
export function gifFrameDelays(frames: number, fps: number): number[] {
	const rate = Math.max(1, fps);
	const delays: number[] = [];
	for (let frame = 0; frame < frames; frame++) {
		const elapsed = Math.round(((frame + 1) / rate) * 100);
		const before = Math.round((frame / rate) * 100);
		delays.push(elapsed - before);
	}
	return delays;
}
