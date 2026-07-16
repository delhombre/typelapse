/**
 * Uniform fit-to-box scale: pure and dependency-free.
 *
 * Returns the largest factor ≤ 1 that makes a `naturalW × naturalH` box fit
 * inside an `availW × availH` box without distortion. Never enlarges (caps at
 * 1), so content smaller than the box renders at its true size. The same factor
 * scales the browser preview into its viewport and the Remotion card into its
 * canvas, so the whole frame is always visible and the two stay WYSIWYG.
 *
 * Degenerate inputs (any non-positive dimension) return 1: there is nothing
 * meaningful to fit, so leave the content untouched.
 */
export function fitScale(
	naturalW: number,
	naturalH: number,
	availW: number,
	availH: number,
): number {
	if (naturalW <= 0 || naturalH <= 0 || availW <= 0 || availH <= 0) {
		return 1;
	}
	return Math.min(1, availW / naturalW, availH / naturalH);
}
