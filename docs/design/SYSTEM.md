# Typelapse design system

Read this and `DECISIONS.md` before touching a screen. Every value is quoted
from the file that ships it, and from the selector too (`file @ selector`)
where the file says it more than once; there are no line numbers, which rot.
When code and page disagree, the code wins and the page is the bug;
`tests/docs/design-system.test.ts` checks every citation and names the ones
that are false. Two values for one role are listed under **Drift**: a screen
pass settles them, never a drive-by.

Warm paper, one dark instrument, one yellow fill per zone. The landing is
seen once and may be memorable; the studio is used for an hour and must be
quiet. Components use role tokens (`--color-*`, `--dock-*`, `--camera-*`,
`--r-*`), never a hex literal, `bg-white` or `border-black`: hard-coded white
and black broke the dark theme the first time. The island's fixed fill is
the one exception (DECISIONS D5).

## Colour

| Role | Light | Dark |
| --- | --- | --- |
| Primary, every filled action | `--color-primary: #f1be01` `src/app.css` | same |
| Primary hover, one step lighter | `--color-primary-hover: #f5c92a` `src/app.css` | same |
| Text on primary (12:1; white is 1.75:1) | `--color-on-primary: #1c1b19` `src/app.css` | same |
| Accent: focus ring and selection only | `--color-accent: oklch(0.62 0.19 268)` `src/app.css` | same |
| Paper (landing, 404, error) | `--color-paper: #faf9f6` `src/app.css @ @theme` | `--color-paper: #121110` `src/app.css` |
| Ink | `--color-ink: #1c1b19` `src/app.css @ @theme` | `--color-ink: #f5f3ef` `src/app.css @ .landing-root[data-theme="dark"]` |
| Ash, secondary text | `--color-ash: #6e6b64` `src/app.css @ @theme` | `--color-ash: #a8a39a` `src/app.css @ .landing-root[data-theme="dark"]` |
| Raised surface | `--color-surface: #ffffff` `src/app.css` | `--color-surface: #1e1c1a` `src/app.css` |
| The one hairline | `--color-hairline: rgb(28 27 25 / 0.1)` `src/app.css` | `--color-hairline: rgb(245 243 239 / 0.12)` `src/app.css` |
| Landing full-bleed band, and the ink on it in both themes (what floats over it, the theme toggle's glyph, reads it too) | `background: #171614` `src/app.css` `--color-band-ink: #f5f3ef` `src/app.css` | `background: #1c1a18` `src/app.css` |
| Island fill (landing) | `--dock-bg: #151517` `src/app.css @ .landing-root` | `--dock-bg: #24232a` `src/app.css` |
| Island ink, dim ink | `--dock-ink: #f2f2f4` `--dock-dim: #9a9aa2` `src/app.css @ .landing-root` | same |
| Island hairline (landing) | `--dock-hairline: rgb(255 255 255 / 0.1)` `src/app.css` | `--dock-hairline: rgb(255 255 255 / 0.12)` `src/app.css` |
| Island hairline (studio) | `--dock-hairline: rgb(255 255 255 / 0.09)` `src/app.css` | same |
| Studio ramp ends, warm stone | `--color-neutral-50: #fafaf9` `src/app.css` | `--color-neutral-950: #121110` `src/app.css` |
| Studio scene hairline | `--sc-hairline: rgb(28 27 25 / 0.1)` `src/app.css @ .studio-root` | `--sc-hairline: rgb(245 243 239 / 0.12)` `src/app.css @ .dark .studio-root` |
| Desktop studio paper, warm (D6) | `--camera-paper: var(--color-neutral-50)` `src/presentation/studio-camera.css` | `--camera-paper: var(--color-neutral-950)` `src/presentation/studio-camera.css` |
| Desktop studio ink | `--camera-ink: var(--color-neutral-900)` `src/presentation/studio-camera.css` | `--camera-ink: #f5f3ef` `src/presentation/studio-camera.css` |
| Desktop muted, the landing's ash (4.87:1 on the pill) | `--camera-muted: #6e6b64` `src/presentation/studio-camera.css` | `--camera-muted: #a8a39a` `src/presentation/studio-camera.css` |
| Desktop line, the scene hairline | `--camera-line: var(--sc-hairline)` `src/presentation/studio-camera.css` | same |
| Desktop pill (fields, selection plate) | `--camera-pill: var(--color-neutral-100)` `src/presentation/studio-camera.css` | `--camera-pill: #292624` `src/presentation/studio-camera.css` |
| Desktop opaque surface (card, timeline), and the menus that hold rows of text: the source menu, its popovers, the project menu, the phone's More menu, the account panel and the phone's sheet at every stop (D5) | `--camera-surface: #ffffff` `src/presentation/studio-camera.css` `background: var(--camera-surface)` `src/presentation/studio-camera.css @ .sc-source-menu` `background: var(--camera-surface)` `src/app.css @ .sc-utility-overflow-menu` `background: var(--camera-surface)` `src/app.css @ .sc-sheet` | `--camera-surface: #1e1c1a` `src/presentation/studio-camera.css` |
| Desktop CTA, timeline selection, a selected rail segment's well at 10% | `--camera-amber: var(--color-primary)` `src/presentation/studio-camera.css` `color-mix(in oklch, var(--camera-amber) 10%, transparent)` `src/presentation/studio-camera.css` | same |
| Desktop ring, selection, easing curve | `--camera-accent: var(--color-accent)` `--camera-focus: var(--color-accent)` `src/presentation/studio-camera.css` | same |
| Destructive mark | `--camera-coral: #ef5b43` `src/presentation/studio-camera.css` | same |
| Error ink: a refused link or diff (5.0:1 on paper) | `--camera-danger: #c53a3a` `src/presentation/studio-camera.css` | `--camera-danger: #f28b82` `src/presentation/studio-camera.css` |
| Browser chrome before paint | `content="#FAF9F6"` `index.html` | `content="#121110"` `index.html` |
| Document behind the studio | `background: #fafaf9` `src/app.css` | `background: #121110` `src/app.css @ html.dark` |

The `--camera-*` tokens are published on both shells, the desktop root and the
phone root, by one rule (`:is(.studio-camera-root, .sc-root-mobile, .sc-tokens)`,
the last for the strip an import link raises, rendered beside the shell, and the
phone's sheet, portaled to the body, which draws only its own hairline and radius).

Theme switch: the landing sets `data-theme` on `.landing-root` and
`data-landing-theme` on `<html>`; the studio toggles `.dark` on `<html>`. The
inline script in `index.html` paints the right one before the bundle runs.
Colour is semantic only (syntax, diff state, the one primary); the chassis
stays neutral.

```text
Which background?
 ├── A filled action (one per zone) → --color-primary, text --color-on-primary
 ├── The island or its sheet → --dock-bg (fixed, never themed)
 ├── A floating surface on the studio paper → the material (Shadows)
 ├── A landing card or bar → --color-surface
 └── Default → --color-paper (landing), neutral-50 or camera-paper (studio)
```

## Type

| Role | Value |
| --- | --- |
| Sans, every UI role | `--font-sans: "Geist", "Geist Fallback"` `src/app.css` |
| Mono, every UI mono role | `--font-mono: "Ioskeley Mono"` `src/app.css` |
| Desktop studio face, as the phone and the landing | `font-family: var(--font-sans)` `src/presentation/studio-camera.css` |
| Studio type scale, five sizes, both shells | `--sc-text-2xs: 9px` `--sc-text-lg: 13px` `src/presentation/studio-camera.css` |
| Studio weights, three | `--sc-weight-regular: 500` `--sc-weight-strong: 650` `src/presentation/studio-camera.css` |
| Video chrome bar | `'JetBrains Mono', ui-monospace` `src/application/layout/frame-metrics.ts` |
| Fallback metrics, no layout shift | `size-adjust: 101.77%` `src/app.css` |
| Never fake a weight | `font-synthesis: none` `src/app.css` |
| Preloaded first-paint files: Geist on every route; Ioskeley and the frame's JetBrains Mono on `/` and `/app` only, the 404 sets text in neither (#214) | `/fonts/Geist-latin.woff2` `/fonts/IoskeleyMono-Regular.woff2` `/fonts/JetBrainsMono-latin.woff2` `index.html` |
| Hero headline, mono 600 | `clamp(2rem, 1.2rem + 3vw, 3.25rem)` `line-height: 1.12` `letter-spacing: -0.02em` `src/app.css` |
| Display, sans 600 | `clamp(2.75rem, 1.4rem + 5.6vw, 4.75rem)` `line-height: 1.02` `letter-spacing: -0.028em` `src/app.css` |
| Section heading, sans 600 | `clamp(2rem, 1.25rem + 2.8vw, 3.05rem)` `line-height: 1.05` `letter-spacing: -0.021em` `src/app.css @ .lp-h2` |
| Lead | `clamp(1.1875rem, 1.05rem + 0.7vw, 1.4375rem)` `line-height: 1.5` `src/app.css @ .lp-lead` |
| Feature line | `clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)` `line-height: 1.6` `src/app.css` |
| Prompt kicker, mono | `font-size: 0.8125rem` `src/app.css` |
| Eyebrow, uppercase 600 | `font-size: 0.75rem` `letter-spacing: 0.18em` `src/app.css @ .lp-eyebrow` |
| Micro stamp | `font-size: 0.75rem` `src/app.css @ .lp-micro` |
| Hero meta, leading as a ratio so it follows the size | `font-size: 13px` `line-height: calc(20 / 13)` `src/app.css @ .lp-hero-meta` |
| Island CTA label, tabular | `font-size: 11px` `font-weight: 650` `src/app.css @ .si-cta` |
| Studio tooltip | `font-size: 11px` `font-weight: 500` `src/presentation/studio-camera.css @ .studio-tooltip` |
| Code row height, every renderer | `LINE_HEIGHT_RATIO = 1.6` `src/application/layout/frame-metrics.ts` |
| Chrome bar text line height | `CHROME_TEXT_LINE_HEIGHT = 1.35` `src/application/layout/frame-metrics.ts` |

Two UI families, Geist and Ioskeley Mono. JetBrains Mono, Fira Code, Source
Code Pro, IBM Plex Mono and Cascadia Code are code-font choices for the video
(`src/application/fonts/code-fonts.ts`), never UI faces. A number that
changes under the pointer is `tabular-nums`, so it never shifts its
neighbours. Landing type lives in the `.lp-*` classes; never set a landing
size inline. The studio's own scale is one set on both shells; Drift 9 lists
what has not adopted it yet.

## Space

| Role | Value |
| --- | --- |
| Landing column, gutter from `sm` | `max-w-[1100px]` `sm:[--lp-gutter:2rem]` `src/presentation/landing/tokens.ts` |
| Landing side gutter, at least the safe area | `var(--lp-gutter, 1.5rem)` `src/app.css @ .lp-gutter` |
| Section rhythm 80 / 96 / 112 | `py-20 sm:py-24 lg:py-28` `src/presentation/landing/tokens.ts` |
| Hero text vertical, also the block radius | `--text-x: 14px` `src/app.css` |
| Hero fixed chrome, stage ceiling | `--hero-chrome: 460px` `--stage-max: 400px` `src/app.css` |
| Helper lane under the stage | `--helper-lane: 34px` `src/app.css` |
| Phone fan row bleeds to the screen edge, clear of a notch | `margin-left: calc(-1 * max(var(--lp-gutter, 1.5rem), env(safe-area-inset-left, 0px)))` `src/app.css` |
| Sheet side gutter, header and content alike; on a desktop its width is its content's, which each sheet names | `--sheet-inline: 28px` `--sheet-inline: 18px` `src/presentation/studio-camera.css` `width: min(var(--sheet-width, 100%), calc(100% - 2 * var(--sheet-margin)))` `src/presentation/studio-camera.css` |
| Island gap (landing, studio phone) | `--island-gap: 5px` `src/app.css @ .lp-island-row` `--island-gap: 5px` `src/app.css @ .si-row` |
| Island gap (desktop studio, 34px labelled controls on the landing plate) | `--island-gap: 2px` `src/presentation/studio-camera.css` |
| Code card slot, scene gutter | `--sc-card-width: 356px` `--sc-gutter: 96px` `src/app.css` |
| Desktop header, timeline | `--camera-header: 80px` `--camera-timeline-height: 218px` `src/presentation/studio-camera.css` |
| Header project name: the desktop corner stops 16px short of the centred Preview/Edit switch and the name ends in an ellipsis; the phone name is never narrower than "Untitled" from 390 up (#167) | `max-width: calc(50% - 22px - 78px - 16px)` `src/presentation/studio-camera.css @ .studio-camera-root .sc-corner-left` `max-width: 28ch` `src/presentation/studio-camera.css @ .studio-camera-root .sc-title` `min-width: calc(4.6em + 4px)` `src/app.css @ .sc-corner-row .sc-title` |

TSX uses Tailwind's 4px steps; CSS writes px and names a value only when
something else derives from it (the island gap feeds the hit extents). A
target may grow into the gap beside it and no further.

## Radius

| Role | Value |
| --- | --- |
| Floating surface (chip, card, tab) | `--r-surface: 16px` `src/app.css` |
| Sheet taller than it is round | `--r-sheet: 20px` `src/app.css @ .studio-root` |
| Control on a flat surface, preview holder | `--r-control: 10px` `src/app.css` |
| Field | `--r-field: 8px` `src/app.css` |
| Control inside a round parent, CTA | `--r-pill: 999px` `src/app.css` |
| Nested in a corner: parent minus gap | `calc(var(--r-surface) - 7px)` `src/app.css` |
| Source hub: a row in the menu's corner, its icon tile, a popover's controls. Library: the badge and the download in a card's corner | `calc(var(--r-surface) - 4px)` `src/presentation/studio-camera.css` `calc(var(--r-surface) - 11px)` `src/presentation/studio-camera.css` `calc(var(--r-surface) - 9px)` `src/presentation/studio-camera.css @ .sc-source-field` `calc(var(--r-surface) - 10px)` `src/presentation/studio-camera.css` `calc(var(--r-surface) - 12px)` `src/presentation/studio-camera.css` |
| Showcase and library picture: the card's corner on top, a preview holder below | `var(--r-surface) var(--r-surface) var(--r-control) var(--r-control)` `src/presentation/studio-camera.css @ .capture-card-preview` |
| Bottom sheet, top corners | `border-radius: var(--r-sheet) var(--r-sheet) 0 0` `src/presentation/studio-camera.css` |
| Hero block and field | `--mode-r: var(--text-x)` `--cap-r: calc(var(--field-h) / 2)` `src/app.css` |
| Code card default (document data) | `borderRadius: block.borderRadius ?? 12` `src/application/render/scene-layer-visuals.ts` |
| Landing window in a mesh, bare card | `WINDOW_RADIUS = 6` `BARE_RADIUS = 11` `src/presentation/landing/static-frame.tsx` |
| Card around its window | `return inner + Math.max(0, gap)` `src/application/layout/concentric.ts` |

```text
Which radius?
 ├── Sits in a parent's corner → calc(parent - gap), floored at 0, kept as calc()
 ├── Inside a fully round parent (island row, status bar) → --r-pill
 ├── Holds a preview (swatch, theme chip) → --r-control, even in the island
 ├── Taller than it is round → never 999px (the sides bow) → --r-sheet
 └── Default → the step for its own height: 10px control, 8px field
```

## Shadows and hairlines

| Role | Value |
| --- | --- |
| Island lift | `box-shadow: 0 8px 24px rgb(18 18 20 / 0.18)` `src/app.css @ .si-island` `--island-lift: 0 8px 24px rgb(18 18 20 / 0.18)` `--island-edge: inset 0 0 0 1px var(--dock-hairline)` `src/app.css @ .landing-root` (the landing's pair: the hero island, its helper and the nav pill, `box-shadow: var(--island-lift), var(--island-edge)` `src/app.css @ .lp-nav-pill`, never inverted, D5) |
| Island on dark: shadow plus edge | `0 8px 24px rgb(0 0 0 / 0.4), inset 0 0 0 1px var(--dock-hairline)` `src/app.css @ .dark .studio-root .si-island` |
| Island sheet | `0 18px 48px rgb(18 18 20 / 0.28)` `src/app.css` |
| Floating material: fill, blur | `color-mix(in oklch, var(--color-neutral-50) 88%, transparent)` `blur(18px) saturate(1.4)` `src/app.css @ .sc-chip` |
| Floating material: edge, depth | `0 0 0 1px var(--sc-hairline), 0 2px 6px rgb(0 0 0 / 0.04)` `src/app.css` |
| Desktop small surface | `--camera-surface-shadow: 0 1px 2px rgb(15 23 42 / 0.035), 0 4px 12px rgb(15 23 42 / 0.024)` `src/presentation/studio-camera.css` |
| Desktop raised (card, timeline): ring inside the stack | `--camera-raised: 0 0 0 1px var(--camera-line), 0 1px 2px rgb(28 27 25 / 0.04)` `src/presentation/studio-camera.css` |
| Desktop raised on dark | `--camera-raised: 0 0 0 1px var(--camera-line), 0 10px 32px rgb(0 0 0 / 0.28)` `src/presentation/studio-camera.css` |
| Header capsules and the easing popover: the floating material | `--camera-material: color-mix(in oklch, var(--color-neutral-50) 88%, transparent)` `src/presentation/studio-camera.css` |
| Bottom sheet, desktop panel and the phone's, no border and no blur: a ring and a shadow cast upward | `--camera-sheet-shadow: 0 0 0 1px var(--camera-line), 0 -18px 48px rgb(18 17 16 / 0.18)` `src/presentation/studio-camera.css` `box-shadow: var(--camera-sheet-shadow)` `src/app.css` |
| A hovered showcase card rises into the floating material's depth | `transition: box-shadow 150ms var(--ease-out)` `src/presentation/studio-camera.css @ .showcase-card` |
| Landing code card | `0 8px 20px -8px rgb(0 0 0 / 0.16)` `src/presentation/landing/static-frame.tsx` |
| Code frame on the landing; its halo, where on dark a ring stands in for the shadow nothing shows against; a raised light picture takes its ring in its stack, never a border | `0 12px 32px -10px oklch(0 0 0 / 0.16)` `src/app.css` `--object-lift: 0 30px 80px -24px rgb(0 0 0 / 0.25), 0 2px 8px rgb(0 0 0 / 0.06)` `--raised-ring: 0 0 0 1px var(--color-hairline)` `src/app.css @ .landing-root` `--object-lift: 0 30px 80px -24px rgb(0 0 0 / 0.6), 0 0 0 1px var(--color-hairline)` `src/app.css @ .landing-root[data-theme="dark"]` |
| Chrome bar closing hairline | `borderAlpha: "0f"` `src/application/layout/frame-metrics.ts` |
| Opaque line where hairlines cross | `--edge: color-mix(in oklch, var(--color-ink) 10%, var(--color-paper))` `src/app.css` |
| The landing's only border | `HAIRLINE = "border-hairline"` `src/presentation/landing/tokens.ts` |
| Reduced transparency: the material goes opaque | `--camera-material: var(--camera-paper)` `src/presentation/studio-camera.css @ @media (prefers-reduced-transparency: reduce) / :is(.studio-camera-root, .sc-root-mobile)` |

One hairline weight, 1px, always a token so a theme flip carries it. Depth is
a shadow stack with a 1px ring inside it, not a `border`. A dark object on a
dark page gains an inset edge rather than a lighter fill. Where the backdrop
changes under a line or two lines cross, use the opaque `--edge`: a
translucent line darkens where it crosses. A header trigger takes the
material's fill without its blur: it sits on flat paper, where a blur shows
nothing and costs a layer. Reduced transparency makes the material itself
opaque (last row of the table).

## Motion

| Role | Value |
| --- | --- |
| Entrances, hovers, presses | `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` `src/app.css` |
| On-screen movement | `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` `src/app.css` |
| The same curve for Motion | `LP_EASE: [number, number, number, number] = [0.23, 1, 0.32, 1]` `src/presentation/landing/tokens.ts` |
| Hover colour, press | `background-color 150ms var(--ease-out), transform 140ms var(--ease-out)` `src/app.css` |
| Desktop studio hover, press | `background-color 150ms var(--ease-out), color 150ms var(--ease-out), transform 100ms` `src/presentation/studio-camera.css @ .studio-scene-context button` |
| Press, one value for a control | `transform: scale(0.97)` `src/app.css @ .lp-field-cta` `PRESS_SCALE = 0.97` `src/presentation/landing/tokens.ts` |
| Press on a card, which moves more at its edges | `whileTap={{ scale: 0.985 }}` `src/presentation/components/layout/template-gallery.tsx` |
| Source hub menu and form popovers: one table, in and out | `ENTER_SECONDS = 0.18` `EXIT_SECONDS = 0.12` `src/presentation/components/layout/source-popover-motion.ts` |
| Tooltip in, out | `110ms cubic-bezier(0.22, 1, 0.36, 1)` `src/presentation/studio-camera.css @ .studio-tooltip[data-state="instant-open"]` `75ms cubic-bezier(0.4, 0, 1, 1)` `src/presentation/studio-camera.css @ .studio-tooltip[data-state="closed"]` |
| Landing reveal | `REVEAL_RISE = 12` `REVEAL_SCALE = 0.985` `REVEAL_BLUR = "blur(6px)"` `src/presentation/landing/tokens.ts` |
| Landing reveal timing | `REVEAL_STAGGER = 0.06` `REVEAL_DURATION = 0.7` `src/presentation/landing/tokens.ts` |
| Spring `snappy` (34 uses) | `stiffness: 400, damping: 30` `src/presentation/motion.ts` |
| Spring `default` (9 uses, the island's width is no longer one) | `stiffness: 205, damping: 22` `src/presentation/motion.ts` |
| Spring `gentle` (6 uses) | `stiffness: 120, damping: 18` `src/presentation/motion.ts` |
| Island width: the landing undershoots and settles; the studio's is critically damped and never crosses its row | `stiffness: 260, damping: 26, mass: 1` `src/presentation/landing/instrument.tsx` `stiffness: 400, damping: 40, mass: 1` `src/presentation/components/controls/island-motion.ts` |
| Aspect frame, bounded tail | `restDelta: 0.004` `src/presentation/landing/instrument.tsx` |
| Timeline context enter, exit | `duration: 0.16` `duration: 0.09` `src/presentation/components/timeline/timeline-motion.ts` |
| Timeline reorder settle | `stiffness: 500` `damping: 42` `src/presentation/components/timeline/timeline-motion.ts` |
| Landing nav reveal, hide | `bounce: 0, duration: 0.42` `bounce: 0, duration: 0.3` `src/presentation/landing/dynamic-nav.tsx` |
| Studio outline while its chunk loads: in after a delay so a fast load never shows it; fill, the studio ramp at 6% | `animation: sk-in 220ms var(--ease-out) 140ms backwards` `--sk-fill: color-mix(in oklch, var(--color-neutral-900) 6%, transparent)` `src/presentation/studio/studio-skeleton.css` |
| Reduced motion keeps only | `transition-property: color, background-color, border-color` `src/app.css` |
| Reduced transparency | `backdrop-filter: none !important` `src/app.css` |

UI motion runs 75 to 220ms; only the landing reveal (700ms) and springs run
longer. Exits are shorter than entrances. Springs come from `springs` in
`src/presentation/motion.ts`; a local spring carries a comment saying what
the shared ones could not do. Every Motion transition reads
`useReducedMotion()` and swaps to `{ duration: 0 }`. Under reduced motion
colour and opacity still fade, anything else lands instantly, and the
landing has no intro at all. Nothing enters from `scale(0)`: reveal at 0.985.

## Touch and input

| Rule | Value |
| --- | --- |
| 44px hit area, visual size unchanged | `width: 44px` `src/app.css` |
| Hit extension for any control | `width: max(100%, 44px)` `src/app.css` |
| Island under a finger: a 48px plate; the landing's controls grow to 36px, the studio phone's root row tiles 44px cells | `height: 48px` `src/app.css @ .lp-island` `--island-control: clamp(24px, calc((100cqi - 44px) / 8), 36px)` `src/app.css` `--island-cell: 44px` `src/app.css` |
| Sheet chips under a finger | `height: 44px` `src/presentation/studio-camera.css @ .sc-layer-pill` |
| A picture built from code is not text to select | `shrink-0 snap-center select-none` `src/presentation/landing/frame-fan.tsx` |
| Popover controls, the sheet's close, the replace question's buttons, the More menu's rows and the account panel's fields and buttons under a finger | `height: 44px` `src/presentation/studio-camera.css @ .sc-confirm-actions button` `inset: -5px` `src/presentation/studio-camera.css @ .sc-source-view-head > button::after` `inset: -5px` `src/presentation/studio-camera.css @ .studio-sheet-header > button::after` `height: 44px` `src/app.css @ .sc-utility-overflow-menu button` `inset: -6px` `src/presentation/components/multimedia/studio-account-control.css` |
| Fields under a finger (iOS zoom) | `font-size: 16px` `src/app.css @ .lp-field` `font-size: 16px` `src/presentation/studio-camera.css @ .sc-layer-field textarea` |
| Hover exists only here | `@media (hover: hover) and (pointer: fine)` `src/app.css` |
| Hover-only helpers vanish on touch | `@media (hover: none)` `src/app.css` |
| No double-tap delay, no tap flash | `touch-action: manipulation` `src/app.css` `-webkit-tap-highlight-color: transparent` `src/app.css` |
| Studio shell does not rubber-band | `overscroll-behavior: none` `src/app.css` |
| Notch and keyboard | `viewport-fit=cover, interactive-widget=resizes-content` `index.html` |
| Keyboard focus ring | `outline: 2px solid var(--color-accent)` `outline-offset: 2px` `src/app.css @ :focus-visible` |
| More contrast asked | `outline-width: 3px` `src/app.css` |

## Drift

Two values for one role in the code. Not fixed in passing: the named pass
decides, then updates the tables above and deletes the row.

| # | Role | What ships | Recommendation |
| --- | --- | --- | --- |
| 5 | Radius | The source hub, the showcase, the drop veil, the capture library and the header triggers read the radius tokens (passes 2026-10-05-studio-drift and 2026-10-05-capture-library). Raw px remain in the timeline's easing and transition panels, `border-radius: 12px` `src/presentation/studio-camera.css @ .studio-easing-presets button`, and in its tempo buttons, `border-radius: 12px` `src/presentation/studio-camera.css @ .studio-transition-tempos` | The menu and the panels: map them as each is next touched |
| 9 | Studio type | The scale is on both shells and the source hub, the showcase, the drop veil and the capture library read it. Sizes of their own remain in the project menu, `font-size: 10.5px` `src/presentation/studio-camera.css @ .sc-project-menu-head small`, and in the easing and transition panels, `font-size: 8px` `src/presentation/studio-camera.css @ .studio-easing-presets-label` | Adopt the scale as each is next touched |
