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

## Follow-up, ticket #153 (2026-10-06)

The phone's second pass. Gate 4 ran in Emil's order: `emil-design-foundations`,
`emil-surfaces` (the material), `emil-ui-polish`, `craft-design-engineering` (Nested
Border Radius, Hit Areas, Gaps are dead zones, Exit Animations), then `emil-ui-review`.
Out of scope: the island's geometry, the sheet's own material (92% with a blur, see Open),
the keys view and the cloud projects list.

### Screen

Route `/app` at 375x812, DPR 2, touch, notch forced through CDP (47 top, 34 bottom),
light and dark: the portaled sheet (`.sc-sheet`) with the text layer's inspector, the
More menu (`.sc-utility-overflow-menu`), the account panel (`.mm-account-popover`) with its
sign-in form. A desktop check at 1440x900 for the panel. The hosted API is mocked with
`page.route` against a hosted build (401 and 429 on sign-in, `delay` for the busy state).

### Before

Hosted build behind `vite preview`; shots and computed values are kept in the session
scratchpad (not committed), the values that matter are written out below.

- **The sheet read a cool copy of the tokens.** `--camera-ink` and `--camera-focus`
  `#1d1d20` (an ink ring), `--camera-pill` `#f1f2f4`, `--camera-muted` `#74717a`,
  `--camera-paper` `#f9fafc`, line `rgb(29 29 32 / 0.06)`; dark `#f5f5f7`, `#242428`,
  `#a09da6`, `#101114`. Field fills were blue-grey beside the warm studio
  (`before/phone-light-sheet-05-field-focus.png`).
- **The More menu was `rgba(255 255 255 / 0.98)` over `blur(18px) saturate(1.05)`**, a
  `1px solid #e5e5e8` border, 18px radius, rows of 11.5px 590 on a 12px radius and 42px
  tall, and its own dark rule (`rgba(29 29 32 / 0.97)`). 210x180.
- **The account panel was `--mm-surface` at 0.96 mixed to 96%, so 0.9216 alpha, over
  `blur(24px) saturate(1.45)`**, a border and a lifted shadow; the stage's mesh and the
  code card showed through it (`before/phone-light-account-429-02-error.png`).
- **The alert moved the form.** A refused sign-in put the alert between the password and the
  button: the button went from y=391.19 to 434.58 (43.4px), the panel 407 to 450. And the
  button, `disabled` while the request was out, handed focus to `body`
  (`document.activeElement` read `BODY` after the refusal), desktop and phone alike.
- `studio-account-control.css` wrote 16 raw radii (8 to 20px) and two hex fallbacks
  (`#c53a3a`, `#4f5bd5`) the multimedia guard skipped by name.

### Decisions

- **Drift 18 settled: the sheet is named where the camera tokens are published**
  (`:is(.studio-camera-root, .sc-root-mobile, .sc-tokens, .sc-sheet)` and its dark twin,
  `studio-camera.css`), and the cool copy in `app.css` is deleted. Found by the e2e, not
  by reading: the sheet is portaled to the body, outside `.studio-root` where the warm
  neutral ramp lives, so `var(--color-neutral-900)` resolved to Tailwind's `oklch(20.5% 0 0)`.
  `.studio-root, .sc-sheet` now carry the ramp. Values after: ink `#1c1917`, pill `#f5f5f4`,
  muted `#6e6b64`, paper `#fafaf9`, line `rgb(28 27 25 / 0.1)`, focus the accent
  `oklch(62% .19 268)`; dark ink `#f5f3ef`, pill `#292624`, muted `#a8a39a`, paper `#121110`,
  line `rgb(245 243 239 / 0.12)`. The sheet keeps only its own `--sc-hairline` and `--r-sheet`.
- **Drift 19 settled: the More menu is the source menu's material** (`emil-surfaces`):
  `background: var(--camera-surface)`, `box-shadow: var(--camera-material-shadow)` (the ring
  inside the stack), no border, no blur, no dark rule (the tokens flip), `--r-surface` 16px,
  rows `calc(var(--r-surface) - 5px)` (the menu's 5px padding), `--sc-text-md` and
  `--sc-weight-medium`, 44px tall (was 42, `emil-touch-and-accessibility`). 210x186.
- **The account island's own tokens are warm** (review of the Ship gate):
  `--mm-hairline` is `var(--camera-line)`, `--mm-deep` is `var(--camera-ink)` and
  `--mm-deep-ink` is `var(--camera-paper)`, with no dark copy since the camera tokens flip.
  The filled "Sign in" button was `#1d1d20` on `#f5f5f7` (dark: `#f5f5f7` on `#1d1d20`),
  a cold white on the warm dark surface; now `rgb(28, 25, 23)` on `rgb(250, 250, 249)`
  (dark `rgb(245, 243, 239)` on `rgb(18, 17, 16)`), the input border
  `rgba(28, 27, 25, 0.1)` (dark `rgba(245, 243, 239, 0.12)`). The danger reds keep their
  two measured values.
- **The form says it is busy**: `aria-busy` on the form while a request is out, beside
  `aria-disabled` on the button and the label change.
- **The account panel is the opaque surface** (DECISIONS D5 as amended): `--mm-surface` is
  `var(--camera-surface)` in both themes, the panel drops its border and its blur and takes
  `--camera-material-shadow`, 16px (`--r-surface`, was 20). Both shells, as D6 says.
- **The alert has a slot, under the button.** Candidates looked at in the build:
  A, a slot reserved under the submit button (`.mm-account-alert`,
  `min-height: calc(1.4 * var(--sc-text-sm) + 18px)` = 33.4px, one line of the chip);
  C, the alert appended after the "New here?" link with nothing reserved
  (looked at in the build by injecting `order`). C leaves no empty room but the panel grows 43px
  and the refusal lands under the secondary link, away from the button that was pressed.
  A wins: the panel is 464.6px tall whether or not there is a refusal, the refusal appears
  where the finger is, and the empty slot reads as the space before the link. Rejected: an
  overlay on the link (it hides "Create an account" after a failure). The chip fades in over
  `150ms var(--ease-out)` on `opacity` only; a refusal that wraps to two lines grows the
  slot and moves the link, never the fields or the button.
- **Focus stays on the button.** Busy is `aria-disabled="true"`, not `disabled`
  (`emil-forms-and-inputs`: a disabled button drops the focus it holds); `submit` already
  returned early on `busy`, so a second press is ignored. The busy look is the same rule on
  `:is(:disabled, [aria-disabled="true"])`, hover and press `:not(...)` of both, and
  `cursor: progress` now wins (it never did: `.studio-root button:disabled { cursor: default }`
  and `button:not(:disabled)` both outranked it).
- **Under a finger** (`(pointer: coarse)`, D10): the panel's fields, primary and switch 44px
  (were 40), the close's reach `inset: -6px` (44px around its 32, was -4 and 40). The rule
  sits after the 40px one, equal specificity (found in the browser: first written before it,
  the buttons stayed 40).
- **The account stylesheet is on the scale** (`craft` Nested Border Radius): 11 to
  `--r-control`, 8 `--r-field`, 20 `--r-surface`, 10 `--r-control`, 14 `--r-control`, 12
  `--r-control` (links, buttons, inputs, cadence well), 15 `--r-surface`, the cadence
  buttons `calc(var(--r-control) - 3px)` (the well's 3px of padding), the error chip
  `--r-control`; `var(--mm-danger)` and `var(--color-accent)` without a hex fallback; the
  island's trigger `--r-pill`. `studio-account-control.css` is no longer exempt in the
  multimedia guard, and the guard now rejects any hex outside a `mask`.

SYSTEM.md: drift rows 18 and 19 deleted, row 5 lost its More menu clause, the opaque-surface
row names the More menu and the panel, the touch row names their 44px. DECISIONS.md: D5 and
D3's "Enforced by" name them.

### After

Same harness on the final hosted build; the measured values:

- Panel, 375x812: alpha 1 `rgb(255, 255, 255)` (dark `rgb(30, 28, 26)`), `backdrop-filter:
  none`, 16px. Refused sign-in (401 and 429): button y 398.19 before and 398.19 after, panel
  464.58 before and after, `document.activeElement` is the button. At 320x640 the 429
  sentence is one line (33.39px), the panel x=15 width 296, the button does not move.
  Busy (900ms delay): `aria-disabled="true"`, no `disabled`, the button still focused,
  `cursor: progress`. Under touch emulation: email 44, primary 44, switch 44, close reach
  `inset: -6px`, field `16px`. Desktop 1440x900: button y 363.19 before and after (was 364.19
  to 407.58), panel opaque light and dark.
- More menu: alpha 1, `backdrop-filter: none`, `border-top-width: 0px`, 16px, shadow
  `rgba(28, 27, 25, 0.1) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px, rgba(0, 0, 0, 0.22) 0 18px 40px -18px`
  (dark `rgba(245, 243, 239, 0.12)` ring), rows 44.
- Sheet: the computed `--camera-*` on `.sc-sheet` equal the root's, light and dark.
- `after/phone-<theme>-*.png` against `before/`.

Tests, red first:

- `tests/presentation/studio-surfaces-system.test.ts`: the sheet's selectors and its two
  copies (3 red), the More menu's surface, row radius and scale (4 red), the panel's surface,
  ring, slot and busy rule (4 red), the multimedia guard now over the account sheet (2 red:
  16 radii, the hexes), the finger's heights (red with the values reverted; the cascade
  order check was added after the browser showed it).
- `tests/presentation/studio-account-control.test.tsx` (2 red: `disabled` present, no slot):
  focus stays on the busy button and a second press is ignored; the refusal arrives in a slot
  that was already there, under the button.
- `tests/e2e/mobile-shell.spec.ts`: the More menu is opaque with 44px rows and the sheet's
  tokens equal the root's, light and dark (2 red on the build without the warm ramp).
- `tests/e2e/hosted/account.spec.ts`: the panel is opaque, the button stays at the same y,
  the panel the same height, focus stays (red on the before build: `blur(24px) saturate(1.45)`).
  Run on my own PostgreSQL and MinIO (`account.spec.ts` and `api-keys.spec.ts`: 4 passed).

### Review verdict

`emil-ui-review` on the diff: **approve with changes**, all made. Should fix: the sheet's
ink and pill were still Tailwind's cold ramp after the tokens moved (found by the e2e); the
buttons stayed 40px under a finger because the 44px rule came before the 40px one; the busy
cursor never applied. Nits left: a refusal that wraps to two lines moves the "New here?"
link by one line.

## Follow-up, ticket #160 (2026-10-06)

The phone sheet is opaque, like every surface that holds text. Gate 4 ran in Emil's order:
`emil-design-foundations`, `emil-surfaces` (the material), `emil-ui-polish`,
`craft-design-engineering` (Shadows, Not Borders; Nested Border Radius; Scroll Fades), then
`emil-ui-review`. Out of scope: the instrument's plate, the sheet's stops and content.

### Decision

- **Material.** `.sc-sheet` paints `background: var(--camera-surface)` (`#ffffff` light,
  `#1e1c1a` dark) at every stop, with no `backdrop-filter`; there is no dark fill rule, the
  token flips. Before: `color-mix(in oklch, neutral-50 92%, transparent)` (dark neutral-950 at
  88%) with `blur(20px) saturate(1.5)`, which let the stage's mesh tint the scene rows.
- **Edge, by looking: the ring and the shadow, not a border.** The 1px `border-top` and the
  `0 -8px 40px -12px rgb(0 0 0 / 0.25)` shadow are replaced by `--camera-sheet-shadow`, the
  token the desktop sheet panel wears: `0 0 0 1px var(--camera-line), 0 -18px 48px rgb(18 17 16 / 0.18)`
  light, `0 0 0 1px var(--camera-line), 0 -22px 56px rgb(0 0 0 / 0.42)` dark. A hairline
  alone could not carry the peek: white on the stage's `#fafaf9` is a 2% step, so the ring
  gives the line (computed `rgba(28, 27, 25, 0.1) 0 0 0 1px`, dark `rgba(245, 243, 239, 0.12)`)
  and the cast shadow the lift. One element, no border beside a shadow (design direction).
  Dark reads as one step above the stage (`#1e1c1a` on `#121110`) plus the ring.
- **Radius** unchanged, `--r-sheet` 20px, top corners only.

### Proof

Route `/app` at 375x812, DPR 2, touch, notch forced through CDP (47 top, 34 bottom), light and
dark, two scenes captured so the sheet holds rows of text; a build of main (before) and of this
branch (after), `vite preview`. Stops by the handle's keys: peek (sheet top 722), scenes
(sheet top 365), full (95). Computed on `.sc-sheet`, light: before `oklch(0.9848 0.0013 none / 0.92)`,
`blur(20px) saturate(1.5)`, border-top 1px; after `rgb(255, 255, 255)`, `none`, 0px. Dark:
before `oklch(0.1784 0.0026 none / 0.88)`, after `rgb(30, 28, 26)`, `none`, 0px. Peek pixels
at x=30: sheet (255,255,255) over stage (250,250,249) light, (30,28,26) over (18,17,16) dark.
Desktop 1440x900, light and dark, the studio at rest: before and after screenshots are
pixel-identical (`ImageChops.difference().getbbox()` is `None`).

Screenshots (scratchpad `160/`): `before-{light,dark}-{1-peek,2-scenes,3-full}.png` and
`after-` the same, `{before,after}-{light,dark}-strip.png` for the three stops side by side,
`cmp-{light,dark}.png` for the peek and scenes crops at 2x.

Tests, red first: `tests/presentation/studio-surfaces-system.test.ts` (the sheet's fill, blur,
border and shadow: 2 red on the old CSS, 54 green now); `tests/e2e/mobile-shell.spec.ts`
"the sheet is opaque at every stop", light and dark, over the three stops (red on the build of
main: `blur(20px) saturate(1.5)`; green on this build).

### Review verdict

`emil-ui-review` on the diff: **ship it**. Nits left: the drag handle (`neutral-300` on white, 1.5:1)
is a slider now and could take a darker step; the dark ring is an alpha white where Emil's rule
prefers a solid line, as every other ring of the product; the desktop sheet panel is flat paper
and the phone's is the white surface, a step the cast shadow explains on a phone and a desktop
never shows.

## Open

- The sheet's own material was an open question until ticket #160 (below): it is opaque now.
- The corner row keeps its 31px pitch and the island's scene dots (24x40) and Export (64x30)
  sit under #140's geometry: neither is 44px by 44px.
- The sheet keeps its scroll position when lowered to the peek, so the peek can show a faded
  middle of the list rather than "Scenes" (the content is inert there now).
- The sheet cannot be pulled below the peek (the drawer stops it), so the floor under the
  instrument is `max(12px, inset-bottom)` by construction and by `dockLiftAt`.
- The keys view's "Create key" and the cloud list's buttons still go `disabled` while busy
  (`studio-api-keys.tsx`, `studio-cloud-projects.tsx`): the same focus drop, not met there
  because a key made moves focus on its own; the form's `disabled={busy}` could take the
  `aria-disabled` rule when that view is next touched.
- `(pointer: coarse)` is matched by the touch emulation here, but nothing was pressed by a
  thumb. Not verifiable here: VoiceOver and TalkBack on the slider, the drag and the keyboard
  on an iPhone, the notch and the home indicator (forced through CDP), WebKit's `inert`, and
  a real `prefers-reduced-transparency` (read from the stylesheet: the panel and the menu no
  longer depend on it).
