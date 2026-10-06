/**
 * The island's width: a spring that never crosses its target.
 *
 * The island springs to the measured width of the row it holds, because
 * `width: auto` cannot be animated. The row keeps its size (`flex: none`) and
 * the island's `overflow: hidden` is the clip, so a spring that overshoots a
 * narrower row closes on its own last control. Under the shared `default`
 * spring (205/22, damping ratio 0.77) that was 4.3px on a 188px swap and 6.8px
 * going back from the Export row, enough to cut the Export button's right edge
 * for the 300ms it took to settle (tests/presentation/island-motion.test.ts).
 *
 * Stiffness 400, damping 40 (twice the square root of 400): critical damping,
 * the least damping that never overshoots, so it is also the quickest spring
 * that is safe here. It reaches 90% of a move in 194ms, as the landing's island
 * does (260/26, 186ms) and as the spring it replaces did (200ms), and is within
 * half a pixel of a 382px swap in 447ms instead of 563ms. The landing keeps its
 * own spring: its rows differ by a few pixels, so its 1.4% overshoot is a
 * fraction of a pixel and its 6px of padding hides it.
 */
export const ISLAND_SPRING = { type: "spring", stiffness: 400, damping: 40, mass: 1 } as const;
