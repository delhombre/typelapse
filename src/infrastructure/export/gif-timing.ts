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

/**
 * The fastest GIF worth delivering, at or below the ask.
 *
 * The format's own ceiling is 50 — two centiseconds a frame — but that is the
 * limit, not the target. LZW cannot compress the dither, so every frame costs
 * nearly a whole frame's worth of bytes, and a GIF that runs at 50 spends its
 * entire budget on motion nobody perceives while the code inside it stays too
 * small to read. Measured on one 5.8 s export: 640 px at 50 fps is 14.98 MB,
 * 960 px at 20 fps is 11.98 MB — 2.25x the pixels, and a fifth off the file.
 *
 * So the cap is a budget decision rather than a format one. Code is read, not
 * watched: 20 carries the morph well enough and leaves the bytes for pixels.
 */
export const GIF_MAX_FPS = 20;

export function gifSafeFps(fps: number): number {
	return Math.max(1, Math.min(Math.floor(fps) || 1, GIF_MAX_FPS));
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
