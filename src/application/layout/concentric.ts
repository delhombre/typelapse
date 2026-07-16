/**
 * Concentric corner radius, pure and dependency-free.
 *
 * Given an inner radius and the gap wrapping it, returns the outer radius that
 * keeps both corners sharing one center: `outer = inner + gap`. The browser
 * preview and the PNG snapshot use it so the card corner always tracks the code
 * window's corner as the margin changes.
 *
 * A square window (inner radius 0) must yield a square card: a soft outer corner
 * around a sharp inner corner reads incoherent, so a zero (or negative) inner
 * radius stays sharp and returns 0. A negative gap is clamped to zero, since the
 * outer corner can never be tighter than the one it wraps.
 */
export function concentric(inner: number, gap: number): number {
	if (inner <= 0) {
		return 0;
	}
	return inner + Math.max(0, gap);
}
