/**
 * Two ways to find out that an export is not going to look like the preview,
 * and the decision to stop rather than to ship it.
 *
 * The spike's sharpest lesson was that a monospace advance is not a constant, it
 * is whatever font the *context* resolved. The lesson has a second half, learned
 * by measuring the presets in a real worker: the advance on its own is a weak
 * signal. Fira Code and Source Code Pro both fall back to a face whose advance
 * matches theirs to 0.0001, so the metric says everything is fine while the
 * video is set in the wrong typeface. Cascadia Code, meanwhile, drifts 0.0142 —
 * twenty-six pixels of accumulated error across sixty columns.
 *
 * So there are two guards, and the first one is the real one: a family the app
 * was supposed to supply and could not is a refusal, whatever it measures. The
 * drift check stays as the net underneath it.
 */

/**
 * How far two scopes may disagree about the advance of `0`.
 *
 * Above the 0.0001 that two genuinely different faces of the same width report,
 * and well below the 0.0142 that a real substitution produced. At the video's
 * 30.8px that ceiling is a third of a pixel per column, so a sixty-column line
 * can be out by nine pixels at most before this fires.
 */
export const MAX_ADVANCE_DRIFT = 0.005;

/**
 * The refusal for families that were asked for and never arrived.
 *
 * Deliberately not a warning. A fallback typeface is invisible in a progress
 * bar and obvious in the finished file, which is the wrong way round.
 */
export function unresolvedFontMessage(missing: string[]): string | null {
	if (missing.length === 0) {
		return null;
	}
	const names = missing.join(", ");
	return `This export needs ${names}, and the renderer could not load ${
		missing.length > 1 ? "them" : "it"
	} here. Rendering anyway would set the video in a different typeface from the one in the preview, so it has been stopped instead. Check the connection and try again, or render on the server.`;
}

/** The refusal for two scopes that resolved a family to different metrics. */
export function advanceDriftMessage(
	renderedRatio: number,
	previewRatio: number,
	fontFamily: string,
): string | null {
	const drift = Math.abs(renderedRatio - previewRatio);
	if (drift <= MAX_ADVANCE_DRIFT) {
		return null;
	}
	return `The renderer and the preview disagree about how wide ${fontFamily} is (${renderedRatio.toFixed(4)} against ${previewRatio.toFixed(4)} of the font size), so the exported video would drift out of line with what you can see. The export has been stopped rather than shipped crooked.`;
}
