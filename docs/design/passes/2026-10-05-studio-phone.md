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

## Follow-up, ticket #141 (2026-10-06)

Decision log `docs/decisions/2026-10-05-next-wave.md` D1. Gate 4 ran in Emil's
order: `emil-design-foundations`, `emil-touch-and-accessibility` (the material),
`emil-animations` for the drag, `emil-ui-polish`, `craft-design-engineering`
(Interruptibility, Hit Areas, Easings), then `emil-ui-review`. Out of scope: the
island's own geometry, Drift 18 and 19 of SYSTEM.md (the sheet's cool tokens, the
More menu), the stage's fit.

### Screen

Route `/app` below the desktop breakpoint, light and dark: the sheet's handle and
its content (`layout/mobile-shell.tsx`), the instrument's slot (`.sc-dock-slot`),
the Showcase's replace question (`.showcase-confirm`, `studio-camera.css`).

### Before

Production build behind `vite preview` on 5240, ms-playwright Chromium 1243, 375x812
at DPR 2, touch, notch forced through CDP (47 top, 34 bottom). A touch drag is CDP
`Input.dispatchTouchEvent` every 16ms; an in-page recorder takes one row per
animation frame (`scratchpad/141/drag.mjs`, rows in `before/drag-*.json`).

- **The instrument stayed where it was while the finger dragged.** From the peek
  to the scenes stop (sheet top 722 to 364): at t=185ms the sheet is at 674.3 and
  the instrument's bottom at 710 (the sheet's top 35.7px above it, over its
  controls), at t=585 531.1 and 710, at t=985 387.9 and 710 (322px of sheet over
  it). It moved only after the release (521.8 at t=1284, 353.0 at t=1685). Gap of
  the sheet's top over the instrument's bottom, every moving frame: from -346 to 12.
  (`before/sheet-light-02-drag-between.png`: the island over the "Edit the code above"
  sentence.)
- **The handle was not a control.** The drawer renders it `aria-hidden`, with no tab
  stop and no key, so a keyboard or a screen reader could not raise the sheet. The
  content below the peek, clipped under the screen's edge, stayed in the tab order.
- **The Showcase's replace question ran its picture into its title** (375x812, all
  four landscape projects): the picture 293.3 to 486.3, the title 469.5 to 489, and
  the picture 13px above its block. The block is a shrinkable flex item and its grid
  rows were `auto`: a track whose item clips its own overflow may shrink to nothing,
  so row 1 got 115.4px for a 192.9px picture (the leftover of 506px), which overflowed
  it centred. The portrait project's picture was 640px wide (a 360px height under the
  card's 16:9 ratio), cut by the screen, and 675px wide on a desktop at 1440, over the
  title and the question (`before/showcase-375-light-0-react-hook.png`,
  `-4-batch-the-query.png`, `showcase-desktop-1440-4.png`).

### Decisions

- **The drawer's own style is the signal** (`hooks/use-dock-follows-sheet.ts`).
  `onDrag` gives a share of the distance between two stops and is called only at the
  full stop and the one before it (never from the peek), so it cannot place anything.
  The drawer writes `transform` and `transition` on the sheet for every pointer move
  and for every settle, whoever asks (finger, key, rotation). A mutation observer
  reads them in the same task, before the frame is drawn, and sets the instrument from
  the sheet's height. The instrument takes the sheet's `transition` string, so a settle
  runs both on one curve and clock, and the 500ms curve constant in `mobile-shell.tsx`
  is gone. React no longer writes the instrument's transform. A fresh load is
  unchanged: the instrument rests on the peek while the sheet slides in.
- **One function says where the instrument is for any sheet height**
  (`phoneSheetGeometry().dockLiftAt`): 12px above the sheet's edge from the peek to
  the scenes stop (the peek when there is no scenes stop), then a straight line down to
  the full stop's rest, never below `max(12px, inset-bottom)`. It equals `dockLift` on
  every stop. Tested in `tests/application/phone-sheet.test.ts`.
- **The handle is a vertical slider** (`role="slider"`, name "Sheet height",
  `aria-valuemin` 0, `aria-valuemax` the last stop, `aria-valuenow`, `aria-valuetext`
  "Collapsed", "Half open", "Open", `aria-controls` the content). A slider is what
  VoiceOver and TalkBack offer raise and lower on (swipe up and down). Keys: Enter and
  Space step up and come back to the peek from the top, the arrows and Page Up and Down
  one stop, Home and End the ends (`phoneSheetGeometry().step`). A tap on the handle
  asks the drawer for "the stop after the last"; that now answers the peek, so tap,
  Enter and Space cycle alike (it did nothing at the top).
- **Collapsed means unreachable** (`emil-touch-and-accessibility`, tab order): at the
  peek the content is `inert`, out of the tab order and the tree, so focus never lands
  below the screen. At the half stop the sheet's lower part is also below the screen's
  edge (it is as tall as the screen and slides), so a focus on anything whose bottom is
  past the window raises the sheet to the full stop.
- The handle's keyboard ring is the accent, 2px at 2px offset (D9), at full opacity (the
  drawer's 70% made it faint); its hit area stays the drawer's 44px.
- `emil-animations`: a key moves the sheet with the same 500ms settle as a tap (a
  large travel, rare, and reduced motion drops it); the dock animates `transform` only.
- **Replace question** (`studio-camera.css`): `grid-auto-rows: max-content` (a row is
  never less than its content, as the Showcase grid and the library already say; the
  block scrolls instead), `aspect-ratio: auto` on the portrait picture, and from one
  column down (960px) the picture is a 3:1 banner (136px high for the portrait one,
  12px of padding) with 18px gaps and 20px on top at 720px, so the question stays in
  reach. Chosen by injecting candidates into the before build: 5:2 left 18px of scroll at
  375x812, 3:1 fits.

### After

`scratchpad/141/after/`, build `scratchpad/141/dist` on 4240.

- Drag, 135 moving frames per run, rows in `after/drag-*.json`: the instrument's
  bottom against the mapping, largest difference 0.01px, in the riding range, past the
  scenes stop, through the settle and when the drag is taken over 150ms into a settle.
  From the peek to the scenes stop: t=242ms sheet 582.8, instrument 570.8; t=325 419.6,
  407.6; t=409 384.7, 372.7; t=492 371.9, 359.9; settle 365.0, 353.0 (gap 12.0 on every
  frame). Held a third of the way past the scenes stop (frames from `up-between`): t=814
  sheet 347.9, instrument 380.0; t=931 282.8, 482.4; t=1048 234.0, 559.2; the full stop
  778 (812 - 34). A quick flick from the peek ends at the full stop (95 and 778) as
  before, with no second step. Landscape 844x390: peek 313 and 301, full 58 and 369
  (390 - 21).
  `after/sheet-light-02-drag-between.png` against `before/`.
- Keyboard (`mobile-shell.spec.ts`): 12 Tab presses from the page start reach the handle
  without passing through the content; Enter, Space, the arrows, Home and End move it
  (sheet tops 722, 365, 95); the next Tab after raising goes into the content. Focus
  ring: `oklch(0.62 0.19 268) solid 2px`, offset 2px (`after/handle-focus-light.png`).
- Accessibility tree (CDP `Accessibility.getFullAXTree`): role `slider`, name "Sheet
  height", focusable, orientation vertical, valuemin 0, valuemax 2, value 0 then 1 after
  an arrow. Chromium leaves `valuetext` empty for every ARIA slider (a bare page shows the
  same), so the words are asserted on the attribute.
- Replace question at 375x812, all six projects, light and dark: the picture ends 18px
  above its title (was a 16.8px overlap), nothing scrolls (495/495, 497/497, 475/475),
  none wider than its column; at 390x844 the same; at 1440x900 the portrait picture
  ends at 810.3, the title starts at 844.3 (was 949.5). `after/showcase-375-light-*.png`.

Tests, red first: `tests/application/phone-sheet.test.ts` (11 red on the missing
`dockLiftAt`, `order`, `step`), `tests/presentation/mobile-shell.test.tsx` (6 red on the
baseline shell: the slider, its keys, the inert content, the instrument's transform and
transition), `tests/e2e/mobile-shell.spec.ts` and `showcase.spec.ts` (8 red on the before
build: the handle absent, the picture 949.5 against 844.3, 497.3 against 489.5; the focus
raise red on the build before it).
`pnpm exec vitest run tests/application/phone-sheet.test.ts
tests/presentation/mobile-shell.test.tsx tests/presentation/studio-surfaces-system.test.ts
tests/docs/design-system.test.ts tests/presentation/layer-editor-in-sheet.test.ts`: 5
files, 72 tests green. `E2E_SKIP_BUILD=1 E2E_PORT=4240 E2E_OUT_DIR=<scratchpad>/dist pnpm
exec playwright test tests/e2e/mobile-shell.spec.ts tests/e2e/showcase.spec.ts`: 23 passed.

### Review verdict

`emil-ui-review` on the diff: **approve with changes**, all made. Should fix: the
handle's ring was 70% opaque (the drawer's opacity), now full; focus could land below
the screen at the half stop, now raises the sheet; a redundant `aspect-ratio` in the
single-column rule, removed. Nits left: a key moves the sheet over 500ms, over the 300ms
of the guide, as the tap does.

## Open

- The island's scene dots (24x40) and Export (64x30) under a finger: U3's island
  geometry (done by #140; see its follow-up).
- The sheet keeps its scroll position when lowered to the peek, so the peek can show a
  faded middle of the list rather than "Scenes" (the content is inert there now).
- Drift 18 (the sheet's cool tokens, the ink ring on the layer inspector's controls) and
  Drift 19 (the More menu) still name the phone pass: neither was in #141's brief.
- The sheet cannot be pulled below the peek (the drawer stops it), so the floor under the
  instrument is `max(12px, inset-bottom)` by construction and by `dockLiftAt`.
- Not verifiable here: VoiceOver and TalkBack announcing "Sheet height, Collapsed,
  adjustable" and the swipe up and down raising it (a slider is what they adjust, but
  nothing was heard); the drag on an iPhone (Safari delivers touch moves between frames,
  and the compositor's clock may differ from Chromium's by a frame); the notch, the home
  indicator and the keyboard, forced through CDP; WebKit's `inert`.
