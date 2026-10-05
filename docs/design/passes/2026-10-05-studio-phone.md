# Pass: the studio on a phone, 2026-10-05

## Screen

Ticket #135, decision log `docs/decisions/2026-10-05-ui-passes.md` D2 to D4.
Route `/app` below the desktop breakpoint: `MobileShell`
(`src/presentation/components/layout/mobile-shell.tsx`) and what it renders:
the corner row (project chip, history pair, resources island, More, account
island when hosted), the stage, the dock (export status and instrument), the
vaul sheet (step builder, layer row, editor or inspector), the drop veil.
Rules: the phone blocks of `src/app.css` (`.sc-root-mobile`, `.sc-corner-row`,
`.sc-sheet`) and the `.sc-sheet` and `(pointer: coarse)` blocks of
`src/presentation/studio-camera.css`.

Out of scope: the desktop shell (U2), the export controls and the island's
own geometry (U3), the preview geometry.

## Before

Production build on `vite preview` port 5304, ms-playwright Chromium 1243,
touch and a mobile user agent, DPR 2, notch forced with CDP
`Emulation.setSafeAreaInsetsOverride`: portrait 390x844 with insets 47 top,
34 bottom; landscape 844x390 with 47 left and right, 21 bottom. The fixture
is built through the UI: a captured code scene, a blank scene with a text
layer (the title card), an image layer, an audio cue. 44 shots, light and
dark, in the session scratchpad `scratchpad/135/before/`
(`<orientation>-<theme>-NN-<state>.png`: empty, peek, scenes, full, the text,
image and audio inspectors, library, add source, More, drop veil), with
`audit.json` (element boxes, controls under 44px, unnamed controls, fields
under 16px). Not committed.

What read as a website rather than an installed app (`emil-mobile-native`):

- **The corner row sat under the notch.** `top: 10px` with a 47px inset: the
  project chip, undo and the resources were behind the status bar and the
  Dynamic Island (row 10 to 50). The add-source menu (`top: 58px`) too.
- **Every sheet stop was 3% off.** The sheet was `max-height: 97%` while vaul
  computes its offsets from the window height, so each stop showed 3% less
  than asked: the 56px peek showed 31px (sheet top 813 of 844), entirely
  inside the 34px home indicator band. Dragging the handle there competes
  with the system's home gesture.
- **Landscape, scenes stop:** 55% of 390 left the frame 0px tall (stage box
  68 to 68); the preview rendered cropped behind the instrument.
- **Landscape, full stop:** the sheet's top at 35px, under the corner row
  (10 to 50). The handle (47 to 53) was mostly behind the row, and the sheet
  is `handleOnly`: there was nearly nothing to drag it back down by.
- **A 44px empty band** in the layer card when the scene has no code: the
  coarse rule grew the strip head for the eye button, which a blank scene
  does not have.
- **The sheet's top hairline never drew:** the sheet is portaled out of
  `.studio-root`, where `--sc-hairline` lives.
- **The add-source divider** drew the browser's default `<hr>`, a solid ink
  line, in both themes: its rule was scoped to the desktop root.
- **Targets** under a finger: the corner row 30x40 (resources 30x30, the
  brand 26x26, the name 26 tall), scene fields 34 tall, delete scene 24 tall
  in a 30px band, the inspector's delete 28x28, order arrows 24x24, presets
  28 tall, placement fields 26 tall, range 16 tall.
- Already right: tap highlight off, `touch-action: manipulation`, hover gated
  by `(hover: hover) and (pointer: fine)`, `100dvh`, no field under 16px
  (audit: zero), `overscroll-behavior: none` on the studio and `contain` in
  the sheet, `interactive-widget=resizes-content`, a theme-color per scheme.
  Missing: `-webkit-touch-callout: none` on controls (a long press on the
  brand link opened iOS's link callout).

## Decisions

- `emil-design-foundations`: the sheet's stops are a layout fact, not a guess
  in fractions. `src/application/layout/phone-sheet.ts` derives them in
  pixels from the viewport height and the top and bottom insets: peek
  `56 + inset-bottom`, full `height - rowBottom - 8`, scenes
  `min(55%, the room that leaves the frame 120px)`, and no scenes stop when
  it would gain under 120px over the peek (a phone on its side). The
  instrument floats 12px above the sheet's edge, at the bottom
  (`max(12px, inset-bottom)`) over the full sheet. The sheet is the full
  screen tall, so vaul's pixel stops are exact. Tested in
  `tests/application/phone-sheet.test.ts`.
- `emil-design-foundations`: the corner row takes
  `top: max(10px, env(safe-area-inset-top))`; the stage slot and the
  add-source menu start from the same line.
- `emil-mobile-native`: the insets reach JavaScript through a probe padded
  with `env()` (`src/presentation/hooks/use-phone-viewport.ts`); its
  ResizeObserver follows a rotation that moves the notch. The sheet is held
  by the name of its stop, so a rotation keeps it there, and a missing
  scenes stop reads as the peek.
- `emil-mobile-native`: `-webkit-touch-callout: none` joins
  `user-select: none` on `button, [role="button"]`.
- `emil-mobile-native`: the drop veil insets every side by its safe area; its
  local `transition: none` under reduced motion is gone (SYSTEM drift 8: the
  global rule keeps the opacity fade).
- `emil-touch-and-accessibility`: under `pointer: coarse`, in the sheet only:
  inspector delete and order arrows 44x44, presets, placement fields, number
  fields, selects, colour and range 44 tall; scene fields and the scene row
  44 tall (`pointer-coarse:h-11` in `step-builder.tsx`); delete scene reaches
  the 44px row and stops at its edge. The corner row keeps its 31px pitch
  (nine controls in 370px cannot each be 44 wide) and every control reaches
  the row's height plus 6px: 30x52 columns, measured by `elementFromPoint`
  sampling, none overlapping.
- `emil-touch-and-accessibility`: names: the audit found no unnamed control
  before or after.
- `emil-ui-polish`: the sheet carries its own `--sc-hairline` and
  `--r-sheet` (20px, settling the 22px of SYSTEM drift 5 for the sheet); the
  strip head grows to 44px only `:has(button)`; the handle darkens under the
  finger (`background-color 150ms`, neutral 300 to 400, dark 700 to 500).
- `craft-design-engineering` (scroll fades): the sheet's scroller fades its
  top 12px (`mask-image`), and the content's top padding grows from 8 to
  12px so nothing is faded at rest.
- Bug fixed in passing, phone scope: `.sc-source-divider` now also matches
  `.sc-root-mobile`.

Motion (`emil-animations`; `review-animations` is not installed in this
environment, its lens came from `emil-animations`' review checklist):

| What | Property | Duration | Curve | Notes |
| --- | --- | --- | --- | --- |
| Sheet snap | `transform` (vaul) | 500ms | `cubic-bezier(0.32, 0.72, 0, 1)` | follows the finger while dragged, settles on release |
| Instrument following the sheet | `transform: translateY` | 500ms | same curve | lands with the sheet; instant under reduced motion |
| Frame room | `padding-bottom` of the slot | none | none | set once per stop, never animated per frame |
| Drop veil | `opacity` | 140ms | `ease-out` | kept under reduced motion (opacity) |
| Handle press | `background-color` | 150ms | default | |
| Layer chip selection | none | 0 | none | frequent, instant by design |
| Sheet content on mount | `opacity` 0 to 1 | 200ms | Motion default | unchanged |

Nothing animates a layout property per frame. Under reduced motion the
global allow-list strips `transform` from vaul's and the dock's transitions.

## After

Same harness and fixture, `scratchpad/135/after/` (44 shots and
`audit.json`). Measured, portrait with the notch: corner row 47 to 87; peek
shows 90px (sheet top 754), handle at 767, above the home band (810); scenes
stop sheet top 380, instrument bottom 368 (12px gap); full sheet top 95,
under the row's 87. Landscape: two stops; frame 117px tall at every stop
(stage 68 to 185, was 0 at the scenes stop); full sheet top 58, handle 71 to
77, clear of the row (50). No horizontal scroll, no field under 16px, no
unnamed control, in all 44 shots.

- `pnpm exec vitest run tests/application/phone-sheet.test.ts tests/presentation/mobile-shell.test.tsx tests/presentation/step-builder-* tests/presentation/studio-layer-strip* tests/presentation/layer-editor-in-sheet* tests/presentation/use-studio-file-drop* tests/presentation/studio-history-controls* tests/presentation/project-chip*`:
  9 files, 42 tests passed.
- `E2E_SKIP_BUILD=1 E2E_PORT=5304 pnpm e2e --grep "phone|Phone|mobile|Mobile"`:
  2 passed (the 375 landing and the mobile shell journey).

## Review verdict

`emil-ui-review` on the diff: approve with changes. Should fix:

- `snapPoints` was a new array every render, and vaul memoizes its offsets on
  that identity. Done: memoized per geometry.
- The add-source divider (found in the after set). Done.

Nits left: the sheet keeps its scroll position when lowered to the peek, so
the peek can show a faded middle of the list rather than "Scenes".

## Open

- The instrument does not follow the sheet during a drag, only on release
  (vaul's `onDrag` gives a percentage, not the sheet's offset). Owner: this
  screen, next pass.
- The island's scene dots (24x40) and Export (64x30) under a finger: U3's
  island geometry.
- The sheet's handle is not reachable by keyboard or a screen reader's
  actions; content below the peek is reachable only by raising the sheet.
- Proposed standing rule for `DECISIONS.md` (at 247 of its 250 lines, so not
  added here): "Phone chrome clears the safe areas: the row from
  `max(10px, inset-top)`, the sheet's stops from `phone-sheet.ts`, the
  instrument above `inset-bottom`." Enforced by
  `tests/application/phone-sheet.test.ts`. Orchestrator's call.
- Real hardware: the notch, the home indicator and the keyboard were forced
  through CDP, not seen on an iPhone.
