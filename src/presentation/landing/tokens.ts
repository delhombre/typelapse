/**
 * Landing design tokens: the one place to retune the page's rhythm and motion.
 * Kept framework-free (plain constants + Tailwind class strings) so a section can
 * be tweaked without hunting through JSX.
 */

export const GITHUB_URL = "https://github.com/delhombre/typelapse";

/** Strong ease-out (matches `--ease-out` in app.css): entrances decelerate. */
export const LP_EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Scroll-reveal viewport: fire once, a touch before the element is fully in view. */
export const REVEAL_VIEWPORT = { once: true, margin: "-80px" } as const;

/** Soft vertical rise on entrance, in px (never a scale from 0). */
export const REVEAL_RISE = 10;

/** Stagger between revealed siblings, in seconds. */
export const REVEAL_STAGGER = 0.06;

/** Reveal durations, in seconds (reduced motion uses the shorter cross-fade). */
export const REVEAL_DURATION = 0.7;
export const REVEAL_DURATION_REDUCED = 0.4;

/** Press feedback: a subtle transform-only scale on tap. */
export const PRESS_SCALE = 0.97;
export const PRESS_DURATION = 0.16;

/** Max content width + responsive side padding: the shared grid frame. */
export const CONTAINER = "mx-auto w-full max-w-[1100px] px-6 sm:px-8";

/** Big vertical rhythm between full sections (96 / 128 / 160px). */
export const SECTION_PY = "py-24 sm:py-32 lg:py-40";

/** A pure-black hairline at low alpha, the page's only "border" weight. */
export const HAIRLINE = "border-black/8";
