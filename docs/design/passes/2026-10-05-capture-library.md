# Pass: the capture library sheet, 2026-10-05

## Screen

Ticket #142, decision log `docs/decisions/2026-10-05-next-wave.md` D1. Route
`/app`, both shells (desktop 1440x900, phone 375x812), light and dark.

- **The capture library**: `layout/capture-library.tsx` and its rules,
  `.capture-*` in `src/presentation/studio-camera.css`.
- **The sheet shell it shares with the showcase**: `ui/studio-bottom-sheet.tsx`
  and the `.studio-sheet-*`, `.showcase-sheet` and `.showcase-confirm` rules,
  for their width, gutters and the sheet's keyboard.
- Drift rows 5 and 9 of `docs/design/SYSTEM.md`, the capture library's part.

Out of scope: the export dock, the island, the discard confirmation and the
menus' material (#140), the phone sheet (#141), the account island (#144), the
showcase's cards themselves.

## Before

Production build served by `vite preview` on 5235, shot with the ms-playwright
Chromium (`scratchpad/142/capture.mjs`): 1440x900 at DPR 1, and 375x812 at DPR
2 with touch, a mobile user agent and the notch forced through CDP
`Emulation.setSafeAreaInsetsOverride` (47 top, 34 bottom). Per theme: the
studio, the library empty, with 1, 3 and 7 captures (and the 7 scrolled), a
hovered and a focused download (desktop), the showcase grid and its replace
question. The captures are real: the GIF, MP4 and WebM are the app's own device
exports (`scratchpad/142/harvest.mjs`), the PNGs are screenshots of the preview
frame at 16:9, 9:16, 1:1 and 4:5 (the app's own PNG export is a corner crop in
this browser, see Open). Seeded into the library's IndexedDB with titles and
dates of their own. 34 images in `scratchpad/142/before/`
(`<shell>-<theme>-NN-<state>.png`) and the computed values in
`probe-desktop.json` and `probe-phone.json`. Not committed.

What a person saw go wrong, measured:

- **The sheet was the window.** At 1440 the panel was 1440 x 420 at x 0: the
  title at 28px, its close button at 1383px, 1352px apart. Three captures sat
  against the left edge (`auto-fill` kept five 267px tracks), with 560px of
  empty paper to their right.
- **The empty state said the state, not what to do.** A 52px tile (radius 17px),
  "No captures yet" (13px at 650, `#1d1d20`) and a 11px line in `#74717a`: no
  definition of a capture, and no action.
- **Rows were squeezed and their footers clipped.** The grid was a shrinkable
  flex item with rows that could shrink, and each card is `overflow: hidden`.
  On a phone with 3 captures a card was 147.3px tall for 224px of content: its
  footer (483.1 to 541.1) sat below the card's bottom (465.4), so the title, the
  size and the download were gone. On a desktop at 1440x400 all four cards of a
  single row were squeezed the same way (the e2e measures it: 4 of 4).
- **Raw values.** Radii 16, 17, 7 and 11px; sizes 13, 11.5, 11, 10 and 8.5px,
  weight 700; `#fff`, `#1d1d20`, `#f1f2f4`, `#74717a`, `#55535b`, and four
  `.dark` rules repeating them. A 1px border plus a one-layer shadow on the card;
  a filled `#f1f2f4` pill download on every card (DECISIONS D2: one filled shape
  per zone); a focus ring of `currentColor`; a badge with `blur(8px)`.
- **A 164px preview holder.** Not 16:9: a 16:9 export left 7px bands above and
  below, and a letterboxed picture had no edge of its own.
- **A spinner for a 25ms read.** "Opening library..." and a rotating ring while
  the list was read, then the grid.
- **Escape did not close the sheet on the phone shell.** The window saw the key
  with its default already prevented (`defaultPrevented: true`; the desktop
  shell's was `false`), so the dialog never raised its cancel: a hardware
  keyboard could open the library and not leave it.
- **The showcase shared the problem.** At 1440 its cards were 696px, its title at
  18px and its close at 1422px, and its replace question centred itself in
  `min(940px, 100% - 56px)`, away from both.

## Decisions

Grill (`mattpocock-skills:grilling`, both sides, recorded in the report): the
sheet's width belongs in the shared shell; three columns at most; read before
open; the empty state is one sentence and the island's own Export one press
away; no new D-number (DECISIONS is at 293 of 300 lines).

Foundations (`emil-design-foundations`):

- **A desktop sheet is as wide as its content, centred.** In the shell, above
  720px (the showcase's single-column breakpoint): `width: min(var(--sheet-width,
  100%), calc(100% - 2 * var(--sheet-margin)))`, `margin-inline: auto`,
  `--sheet-margin: 24px`. Each sheet names its content's width in
  `--sheet-width`; a phone's sheet spans the screen, unchanged. Settled by
  looking: an injected prototype on the before build showed the showcase at 928px
  reads better than at 1440 (two 440px cards, 1.8 rows in view against 1.4), so
  the rule is in the shell and serves both.
- **The library's width is its cards'.** `--capture-columns` (1, 2, 3) is counted
  from the cards by `:has(.capture-card:nth-child(n))`; width is `max(440px,
  columns * 256px + (columns - 1) * 12px + 2 * var(--sheet-inline))`. One
  capture is 440px (the card fills it, 384px), two 580px, three or more 848px;
  a fourth is a second row. Four columns (1116px) were tried and dropped: more
  of the window than a card should take. The showcase is `2 * 440px + 12px + 2 *
  18px` = 928px, and its replace question takes the sheet's gutters (`width:
  100%`, padding of `--sheet-inline`, so the rings of its picture and card stay
  inside the clip of a block that scrolls).
- **The height follows the content** (`min-height: 0` on the library; the shell
  keeps `min(420px, 62vh)` for the showcase), up to 74vh.
- **The sheet reads first and opens second.** Its width depends on what it
  holds, so a read after opening would widen it during its entrance. Measured
  from the press to the open dialog: 24.8ms cold, 27.1ms warm, with 7 real
  captures. `loading`, the spinner, its keyframes and the sentence are deleted;
  while open the sheet follows the library (a capture that finishes or goes
  appears in place).
- **The empty state is one sentence and the action.** "Export a PNG, GIF, MP4 or
  WebM and it is kept here as a capture." says how to make one and what it then
  is; the title "No captures yet" goes (it said the state). "Export" is the
  zone's one filled shape (D2). It closes the sheet and, once the dialog has
  closed (a modal dialog makes the page behind it inert, so a panel opened
  sooner cannot take focus), clicks the island's own Export button through its
  existing `data-island-opener` hook: the panel opens and its way back has
  focus (e2e), on the phone too (the cluster sheet opens on the Export tab).
  `StudioBottomSheet` gains `onClosed` for it.
- **Rows are as tall as their cards** (`grid-auto-rows: max-content`,
  `align-content: start`, `min-height: 0`): the bug above, as the showcase's
  grid already has it. More rows than the sheet holds now scroll.
- **Gutters.** The grid and the empty state take `--sheet-inline` (28px) with
  the safe areas, so the title lines up with the first card; the grid's bottom
  clears the home indicator (`max(28px, inset-bottom + 16px)`).
- **Keyboard.** The sheet answers Escape itself (`onKeyDown` on the dialog): a
  handled key raises no native cancel (0 `cancel` events counted on both shells),
  so it closes once on a desktop and now on the phone shell too. Bug fixed in
  passing, shell scope.

Surfaces (`emil-surfaces`, the material skill):

- The card is the showcase's opaque card: `--camera-surface`, `--camera-raised`
  (a ring inside the shadow stack, no border), `--r-surface` 16px. The four
  `.dark` rules are deleted: the tokens flip.
- The preview holder is 16:9 (`aspect-ratio`, 144px at 256px wide), `--camera-pill`,
  the card's corner on top and `--r-control` below, as the showcase's picture.
  The picture is sized by its own aspect (`max-width` and `max-height` 100%) with
  the 1px inset outline, black at 10% in light and white at 10% in dark, so the
  line follows the picture and not the letterbox.
- The format badge is the island's fixed dark (`--color-neutral-950` at 78%,
  text `--color-neutral-50`), radius `calc(var(--r-surface) - 10px)` = 6px for
  the 10px it sits in, and no blur: at 78% it needs none and 24 cards would each
  have paid a layer.
- The download is a ghost icon button (D2), radius `calc(var(--r-surface) -
  12px)` = 4px (12px from the card's right and bottom); the empty tile is
  `--camera-pill` with an inset `--camera-line` ring, `--r-control`, 40px.

Polish (`emil-ui-polish`):

- The download is 34px drawn and 44px to a finger (`::after`, `inset: -5px`); the
  action 32px, 40px to a mouse (`inset: -4px 0`) and 44px tall under
  `pointer: coarse`. Hover fills `--camera-pill` and inks the glyph, behind
  `(hover: hover) and (pointer: fine)`; a press answers with the same fill, as
  the sheet's close does; keyboard focus is `2px solid var(--camera-focus)` at 2px
  (D9), where it was `currentColor`. The action hovers to `--color-primary-hover`.
- Thumbnails are `loading="lazy"` and `decoding="async"` (a capture is the whole
  export: up to 24 of them were decoded on the main thread as the sheet slid in).
- The badge is inert (`pointer-events: none`, `user-select: none`); the title
  carries its full text in `title` for when it is truncated; the card's meta
  line has tabular digits; the preview holder mutes its placeholder glyph.
- Footer insets 12px both sides (were 13 and 11), on the 4px scale and equal to
  the gap under the button, so the corner radius is exact.

Type (from the scale, Drift 9): the card title 12px at 650 with the showcase
card's `-0.01em`, the meta 10px, the badge 9px at 650 (0.06em, loosened for
capitals), the empty sentence 12px in the ink at `30ch` with `text-wrap:
balance`, the action 11px at 600.

Craft (`craft-design-engineering`):

- Nested Border Radius: the badge 6px, the download 4px, each with its inset in
  the comment. Hit Areas, Image Outlines, Shadows Not Borders, Tabular Numbers
  and Text Wrapping as above. Letter Spacing: the card title matches the
  showcase's.
- Checked and not done: Button Press on the ghost download (the sheet's close
  answers with the fill, and 3% of 34px is a pixel), Hover Restraint (150ms is
  the system's one timing, `tests/presentation/studio-surfaces-system.test.ts`),
  Scroll Fades (a sliced card already says the list scrolls, and
  `emil-surfaces` forbids a fade over scrolling content).

Motion (`emil-animations`):

| Element | Trigger | Property | Duration and curve | Reduced motion |
| --- | --- | --- | --- | --- |
| Sheet and scrim | open, close | transform y, opacity | 300ms in, 210ms out `[0.32, 0.72, 0, 1]` (unchanged) | 0ms |
| Download | hover, press | background-color, color | 150ms `var(--ease-out)` | kept |
| Export action | hover | background-color | 150ms `var(--ease-out)` | kept |
| Export action | press | transform (Motion `whileTap`) | `springs.snappy`, scale 0.97 | no movement |

Nothing animates a layout property. Deleted: the spinner, `animation:
capture-library-spin 0.8s linear infinite`.

Docs: SYSTEM.md Drift 5 and 9 lose the capture library (rows edited in place,
248 lines still); the sheet row gains the desktop width, the derived-radii row
the badge and the download, the picture row the library. DECISIONS D3 says the
capture library is read for the radius scale. `CONTEXT.md` defines **Capture
library** and the word **capture** the empty state now uses (the step builder's
Capture is another thing).

## After

Production build of the final code (`scratchpad/142/dist-after`, `vite preview`
on 5235), the same fixtures and script: 34 images in `scratchpad/142/after/`
and `probe-all.json`.

- Probe, desktop light: empty sheet 440 x 315.5 at x 500 (centred in 1440); three
  captures 848 x 335 at x 296, grid `256px 256px 256px`, gap 12px; card 256 x 202,
  radius 16px, ring `0 0 0 1px` in its shadow stack, no border; preview 144px,
  radii `16px 16px 10px 10px`; badge 9px at 650, radius 6px; footer padding
  `0 12px`; title 12px at 650, meta 10px in `rgb(110, 107, 100)`; download 34px,
  radius 4px, transparent, `background-color 0.15s` and `color 0.15s`, hovered
  `rgb(245, 245, 244)`, focused `oklch(0.62 0.19 268) solid 2px` at 2px.
- Phone light, 3 captures: cards 237.4px tall (179.4 + 58), footers in view, the
  list scrolls; empty sheet 345.5px tall (was the shell's 420 minimum).
- Showcase: sheet 928 x 666 at x 256, grid `440px 440px`; its replace question
  536.25px and 321.75px wide, aligned to the title.
- Hand-off, in a real browser: on a desktop the dialog is hidden, the Format
  group is visible and "Back to studio controls" has focus; on the phone the
  cluster sheet is open on its Export tab.
- Tests, each seen red first:
  - `tests/presentation/capture-library.test.tsx` (7: the sentence and the
    action, the hand-off after close, listing, emptying, Escape under a claimed
    key, lazy thumbnails). Three red at the start (sentence, hand-off, emptying);
    the Escape and thumbnail tests red when written.
  - `tests/presentation/studio-surfaces-system.test.ts`: `capture-` joins its
    selectors (2 red: 5 radii, 8 sizes and weights) and a `sheet` block (the
    desktop width rule, the phone's full width, each sheet names its width; 3
    red).
  - New `tests/e2e/capture-library.spec.ts` (5) and a test in
    `tests/e2e/showcase.spec.ts`, red against the before build: the empty
    sentence absent, widths all 1440, `squeezed` 4 instead of 0, the phone's
    sentence absent, the showcase 1440 against 1392 at most; and Escape still
    visible after 10s on the phone, against the same code without the shell's
    key handler.
  - `pnpm exec vitest run tests/docs/design-system.test.ts
    tests/presentation/studio-surfaces-system.test.ts
    tests/presentation/capture-library.test.tsx
    tests/presentation/studio-bottom-sheet-motion.test.ts
    tests/presentation/template-gallery-preview.test.tsx
    tests/presentation/mobile-shell.test.tsx
    tests/presentation/import-guards.test.tsx
    tests/presentation/source-import-replacement.test.tsx
    tests/infrastructure/browser-capture-library.test.ts`: 9 files, 82 tests green.
  - `E2E_SKIP_BUILD=1 E2E_PORT=5235 pnpm exec playwright test
    tests/e2e/capture-library.spec.ts tests/e2e/showcase.spec.ts
    tests/e2e/mobile-shell.spec.ts`: 19 passed.
  - `pnpm check-types` and `pnpm exec biome check` on the changed files: clean.

## Review verdict

`emil-ui-review` on the diff: **approve with changes**. No blocking finding
(every control works with a mouse, a keyboard and a thumb; targets 44px; focus
visible; contrast 5.3:1 for the muted line on the card, about 10:1 for the badge
over a bright picture). Should fix, both done:

1. Thumbnails were full-size blobs decoded eagerly (Performance: nothing may
   decode a huge asset to show a thumbnail): `loading="lazy"` and
   `decoding="async"`, with a test.
2. The footer's 13px and 11px insets were off the scale and left the button's
   corner 1px off concentric: 12px both sides, radius 16 - 12.

Nits left: the disabled download is `opacity: 0.45` rather than a token (the state
lasts one frame, the object URL is made in an effect); the image outline flips by
a `.dark` selector as the project menu's thumbnail does; `scrollbar-gutter:
stable` (the showcase's choice) reserves the gutter beside the right padding on a
platform with classic scrollbars; the cards are `article`s without a name.

## Open

- **No real thumbnails.** A card decodes the whole export (a 4K PNG, a GIF of
  megabytes) to show 256px. Lazy and async loading soften it; a small image
  written with the capture at export time would end it. Owner: the export store.
- **The hand-off is a DOM contract.** The action clicks `[data-island-opener=
  "export"]`; when a panel is already open the island does not render that button
  and the action only closes the sheet. A typed "open export" request in the
  export store would remove the query, and touches the island (#140's file).
- **The app's own PNG export is a corner crop in headless Chromium 151 at
  1440x900.** `[data-export-target]` is laid out at 961x580 and scaled by 0.3926
  by its stage, and `domToBlob` sized the canvas from the scaled box: the file is
  754x455, the top left of the card. Found while making captures; not verified on
  real hardware. Owner: the export pass.
- **Cloud renders are not kept here.** The sheet's subtitle ("Exports stay on this
  device ...", unchanged) and the new sentence hold for device and local server
  exports; a hosted build's Cloud render is not a capture. Owner: the Cloud copy.
- **The phone's Showcase replace question overlaps itself**, before and after
  this pass: at 375x812 the picture spans 293 to 486 and the title 470 to 489, and
  the picture starts 13px above its block (306). Owner: #141.
- **Escape on the phone shell** is answered by the sheet now; the cause is the
  phone drawer claiming the key on the document (vaul), which #141 may prefer to
  fix at the source.
- **Not verified in a browser:** reduced transparency, forced colours, classic
  scrollbars, Safari (`<video preload="metadata">` may paint no first frame there),
  real hardware (the notch and the home indicator were forced through CDP).
