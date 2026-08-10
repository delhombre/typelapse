/**
 * Landing design tokens: the one place to retune the page's rhythm and motion.
 * Kept framework-free (plain constants + Tailwind class strings) so a section can
 * be tweaked without hunting through JSX.
 */

export const GITHUB_URL = "https://github.com/delhombre/typelapse";

/** Strong ease-out (matches `--ease-out` in app.css): entrances decelerate. */
export const LP_EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** A stronger ease-out for the materialized reveal: a longer, softer tail so the
    block reads as coming into focus rather than sliding in. */
export const REVEAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Scroll-reveal viewport: fire once, a touch before the element is fully in view. */
export const REVEAL_VIEWPORT = { once: true, margin: "-80px" } as const;

/** Materialize on entrance: a soft rise, a whisper of scale-up (never from 0), and
    a blur that resolves — the section comes into focus. */
export const REVEAL_RISE = 12;
export const REVEAL_SCALE = 0.985;
export const REVEAL_BLUR = "blur(6px)";

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

/** Vertical rhythm between full sections (80 / 96 / 112px).
    Was 96 / 128 / 160, which put 320px of empty paper between two sections whose
    content is a heading, three lines and one frame. Measured on the shot, the
    gap read as the page having run out rather than as breathing room. */
export const SECTION_PY = "py-20 sm:py-24 lg:py-28";

/** The page's only border weight. A token, not a literal, so it survives a
    theme flip: a black hairline is invisible on a dark background. */
export const HAIRLINE = "border-hairline";
