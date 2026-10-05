# Pass: export dock, status, Cloud receipt, source hub, account island, 2026-10-05

## Screen

Ticket #134, decision log `docs/decisions/2026-10-05-ui-passes.md` D2 to D4.
Route `/app`, desktop shell (`scene-shell.tsx`), light and dark, local and
hosted builds:

- The export dock: the rail's Export mode and its neighbours Frame, Look and
  Motion (`controls/studio-cluster-mode.tsx`, `cluster-panels.tsx`,
  `island-primitives.tsx`, `preview-island.tsx`), the Render button and its
  states.
- The floating export status (`controls/export-status.tsx`,
  `controls/cloud-render.tsx`): progress, receipt, the device alternative after
  a server refusal, the Cloud line (allowance note, refusal, running,
  succeeded with Download, Copy public link and Make private).
- The source hub (`layout/studio-source-hub.tsx`, `url-import-menu.tsx`,
  `diff-import-menu.tsx`) and the replace confirms it hosts.
- The account island (`layout/studio-account-island.tsx` and `.css`,
  `multimedia/studio-account-control.tsx` and `.css`).

Out of scope: the timeline, the editor, the preview geometry, the rest of the
desktop shell (U2) and the phone (U4). The brief asked for 1440 and 1920
rather than 375: the phone is U4's pass.

## Before

Production builds behind `vite preview`: local on 5303, hosted on 5313 with
the API on 3313 against a throwaway PostgreSQL 16 (`typelapse-u3-pg`, 54313).
Shot with the ms-playwright Chromium (`scratchpad/134/capture.mjs`), 25 states
at 1440x900 and 1920x1080, light and dark: 101 images in
`scratchpad/134/shots/before/` (`<state>-<width>-<theme>.png`). The Creator
states replay a recalled job (`typelapse:cloud-render-job`) against scripted
`/api/cloud/jobs/*` answers, since no MinIO or worker ran; the server refusal
is the API's 400 sentence, scripted the same way. Not committed.

What read crowded, flat, inconsistent or generated:

- **Status and rail were two objects.** The status was `width: min(660px,
  100%)`, 36px tall, on `--dock-bg` with no edge; the rail under it is 42px,
  `#151517`, a 1px white/0.1 edge and `--camera-dark-shadow`. Neither edge
  lined up with the root row (about 830px) or the Export row (about 940px).
- **Busy Render looked broken.** `aria-disabled` dropped the amber to
  `opacity: 0.55` on the dark plate: an olive pill reading "Rendering…".
- **Status marks were glyphs of text.** Failure was a bold `!`, dismiss a
  `×` character, the check 11px at stroke 2.5. Every action in the status
  (Download, Copy public link, Render on this device) was the same dim text:
  no next step.
- **Fake progress.** The cloud and server phases drew a fixed third of a bar;
  the device bar was a `width` spring (205/22) that trailed and overshot the
  percentage printed beside it (SYSTEM Drift 16, DECISIONS D8).
- **The note was a result.** The free allowance sentence used the receipt's
  ink and ran into the pill's right curve, as did "Rendering on Typelapse
  Cloud…".
- **Dismissing the status closed the Export panel.** The status sits outside
  the island's DOM, so its pointerdown counted as "outside".
- **Source menu.** A header repeated the trigger ("Add source") over a
  generic line; a chevron on all six rows, though four act at once; a solid
  `#e5e5e8` border with one 42px shadow; icon tiles at 11px inside 14px rows
  with a 7px inset. In dark, the open trigger's label vanished: ink
  `#1d1d20` on the `#242428` pill (`--camera-ink` is not themed).
- **Link and change popovers.** The URL field was a bare input with an
  Enter handler, no `<form>`; its refusal stayed while the link was edited;
  an empty Fetch did nothing; neither field said it was invalid
  (`aria-invalid`, `aria-describedby`). Lowercase placeholders
  ("gist or github url"). Both scaled from `top right` though anchored at the
  hub's left. Fetch and Apply wore a yellow glow shadow.
- **Confirms.** The replace question was a bordered card inside the bordered
  popover; at 278px its two buttons wrapped onto two lines each. A JSON file
  that does not parse was asked about first ("Replace what you have with
  broken.json?") and refused after.
- **Account, signed out.** Native validation bubbles, one field at a time
  (Chrome's "Please enter a part following '@'"). "Continue" for both sign in
  and sign up, "Working…" while busy. Errors in `#c93f3f` on the dark panel
  (about 3:1). Email focus ring in the primary yellow.
- **Account, signed in.** A decorative cloud tile, then "ON THIS DEVICE"
  above the person's name, where it read as a fact about the person. Type at
  8.5, 9.5, 10.5px and weights 620 to 760.

## Decisions

Foundations (`emil-design-foundations`):

- The status takes the rail's material in the desktop shell: `#151517`,
  `1px solid rgb(255 255 255 / 0.1)`, `--camera-dark-shadow`, `min-height:
  42px`, `padding: 3px 3px 3px 14px`, and hugs its content up to
  `min(720px, 100vw - 40px)`; the track is a fixed 168px. Scoped to
  `.studio-camera-root`, so the phone keeps its own.
- One next step per status: `.si-status-action` (ink on
  `rgb(255 255 255 / 0.08)`, hover 0.14) on Download, Render on this device,
  Upgrade to Creator. Copy link, Make private and Cancel stay dim: waiting is
  the next step while rendering, not cancelling.
- The allowance note is dim ink (`data-note`), a sentence with nothing after
  it keeps 11px on the right.
- Source menu: no header (the trigger names it), chevrons only on the two
  rows that open a second view, the media detail shortened to "Behind or above
  the code" so it fits 278px.
- Account signed in: initials, name and email first; the allowance; then the
  cloud copy under a hairline with its state, its sentence and its one action;
  then Sign out. The cloud tile is gone. Copy kept word for word (the hosted
  journeys read it).
- Type in the account panel and the source hub snapped to 9, 10, 11, 12px and
  600 or 650 (SYSTEM Drift 9's recommendation, for these blocks only).

Material (`emil-forms-and-inputs`, then `emil-surfaces`):

- Sign in and sign up check on submit, beside each field, then on every
  change once shown (`noValidate`, messages "Add your name.", "Enter an email
  address like ada@example.com.", "Use at least 8 characters."), wired with
  `aria-invalid` and `aria-describedby`, outside the label so they never join
  the field's name; focus goes to the first invalid field.
- Submit says what it does: "Sign in" / "Create account", busy "Signing in…"
  / "Creating account…"; Sign out says "Signing out…".
- The URL field is a `<form>` (Enter submits natively), `inputMode="url"`,
  `autoComplete="off"`; editing takes the refusal back; an empty Fetch says
  "Paste a gist or GitHub link first.". The diff textarea gets the same
  invalid wiring and a tooltip naming ⌘ Enter on Apply.
- A project file is parsed and checked (`openStudioDocument`) before the
  replace confirm: a file that cannot open is refused with a notice and never
  asked about.
- The export status is a companion of the dock (`data-island-companion`):
  answering it never closes the panel it reports on.
- Menus and form popovers: depth from a ring in a shadow stack,
  `0 0 0 1px rgb(29 29 32 / 0.08), 0 2px 6px rgb(20 20 24 / 0.05), 0 16px
  40px -12px rgb(20 20 24 / 0.16)`; dark, a white/0.09 ring and one deep
  shadow. No solid border.
- Concentric radii: menu 18px, row 14px (4px inset), icon tile 7px (7px
  inset); popover 18px, back button 9px (9px padding).
- The replace confirm inside a popover loses its own border and fill and its
  buttons never wrap; the URL popover is 320px wide.
- Glow shadows removed from Fetch and Apply; dark error red `#f28b82` (6:1),
  light `#c53a3a` (5.2:1), through `--mm-danger` in the island.
- Dark: the open Add source trigger's label is `#f5f5f7`.

Polish (`emil-ui-polish`), then motion (`emil-animations`):

- Hit areas: the account close (32px drawn) and the popover back (30px)
  extend to 40px with an `::after`.
- Hover 150ms `var(--ease-out)` on colour and background in these blocks;
  press `scale(0.97)` (SYSTEM Drift 7's value) on the account buttons, with a
  reduced-motion path. The account form's focus ring is the accent (D9), not
  the primary.
- Busy Render keeps its fill at full opacity, `cursor: progress`; a disabled
  Render (nothing to render) is a muted fill `rgb(255 255 255 / 0.08)` with
  `#8e8c95` text instead of 55% amber.
- Rail eyebrows `#74727b` (3.8:1 at 10px) to `#8e8c95` (5.4:1).

| Element | Trigger | Properties | Duration, curve | Reduced motion |
| --- | --- | --- | --- | --- |
| Status pill in | a status appears | opacity 0 to 1, y 6 to 0, scale 0.98 to 1 | spring 400/30 (`springs.snappy`) | opacity only, 0ms |
| Status pill out | dismissed or replaced (`mode="wait"`) | opacity to 0, y 0 to 4, scale to 0.99 | 120ms `cubic-bezier(0.4, 0, 1, 1)` | opacity, 0ms |
| Progress, measured | each progress update | `transform: scaleX(r)` from the left edge | 160ms linear | none |
| Progress, unmeasured | server and cloud phases | `translateX(-100%)` to `280%` on a 36% segment | 1.3s `cubic-bezier(0.65, 0, 0.35, 1)`, infinite | static full track at 0.45 opacity |
| Source menu in | Add source | opacity, y -5 to 0, scale 0.97 to 1, blur 4px to 0, origin top left | 180ms `cubic-bezier(0.23, 1, 0.32, 1)` | opacity, 10ms |
| Source menu out | Escape, outside, a choice | opacity, y -3, scale 0.98, blur 2px | 120ms `cubic-bezier(0.4, 0, 1, 1)` | opacity |
| Link and change popovers | open, close | as the menu; origin top left when embedded, top right standalone | 180ms in, 120ms out | `MotionConfig reducedMotion="user"` drops the transform, keeps opacity |
| Account popover | trigger | in: opacity, y -5, scale 0.985; out: opacity, y -3, scale 0.99, origin top right | 160ms `cubic-bezier(0.16, 1, 0.3, 1)` in, 110ms ease-in out | opacity, 0ms |
| Dock mode rows | open, switch, back | unchanged: in opacity 0.99, scale 0.98 to 1 (`springs.snappy`), out 120ms; island `width` spring 205/22 (the D8 exception) | as shipped | opacity |
| Segment plate | choosing an option | `layoutId` glide | `springs.snappy` | 0ms |

`review-animations` could not run from an agent (user-invoked only); the table
above is the frame-state hand-off for it.

## After

`scratchpad/134/shots/after/`, the same 25 states, 1440 and 1920, light and
dark (101 images, same names as before).

Tests, red first: `studio-account-control.test.tsx` (inline checks, "Sign
in"), `studio-source-hub.test.tsx` (unreadable file refused before the
confirm; the link refusal taken back on edit), `studio-control-rail.test.tsx`
(dismissing the status keeps Export open), `export-status-progress.test.tsx`
(new: `scaleX`, no width; unmeasured phases marked). The brief's set,
`vitest run tests/presentation/export-* studio-source-hub studio-account-island
studio-account-control hosted-render-jobs-store cloud-public-page busy-label
live-regions studio-control-rail`: 22 files, 114 tests, green.
`E2E_SKIP_BUILD=1 playwright test --grep "export|Export"` on this pass's
build: 4 passed. The hosted helper `tests/e2e/support/hosted.ts` presses
"Create account" now; the hosted journeys need MinIO and were not run.

## Review verdict

`emil-ui-review`: **Approve with changes**. Should fix, both done:

- The fill switched from the travelling segment to the measured scale on the
  same node, so the 160ms tween interpolated `translateX` into `scaleX`: keyed
  apart (`travel`, `measured`).
- Cancel carried the action wash while rendering, a destructive choice dressed
  as the next step: back to dim.

Nits left: "Signing out…" is wider than "Sign out" (the button sits alone at
the row's end, nothing moves); the server's sign-up error stays until the next
submit.

## Follow-up, ticket #140 (2026-10-05)

Decision log `docs/decisions/2026-10-05-next-wave.md` D1 and D6. It settles three
items this pass ended on (the rail's selected segments, the island's width
spring, `ConfirmDiscard`), the island's targets under a thumb that the phone
pass left to this one, and D6's call on the menus that hold text. Gate 4 ran in Emil's order: `emil-design-foundations`,
`emil-surfaces`, `emil-ui-polish`, `craft-design-engineering`, then
`emil-touch-and-accessibility` and `emil-animations` as refinements, and ended
on `emil-ui-review`.

### Screen

Route `/app`, both shells, light and dark.

- The rail: the `.si-*` rules of `src/presentation/studio-camera.css` (selected
  segments, hover, the export button, the island's right padding).
- The island's width: `controls/preview-island.tsx` and the new
  `controls/island-motion.ts`.
- The replace question: `ui/confirm-discard.tsx` (`ConfirmDiscard`,
  `ConfirmDiscardOverlay`) in its four hosts: the source popovers, the
  Showcase, the project-file modal and the strip an import link raises
  (`layout/import-intent-boot.tsx`).
- The phone's island under a thumb: `src/app.css`, `hooks/use-media-query.ts`,
  `utils/playback-readout.ts`.
- The menus that hold text: `.sc-source-menu`, `.sc-source-form-popover`,
  `.sc-project-menu`.

Out of scope: the capture library (#142), the account island (#144), the phone's
bottom sheet (#141), the cluster sheet and the social row on a phone, and
landscape phones and tablets.

### Before

Production build behind `vite preview` on 5234, ms-playwright Chromium 1243:
desktop 1440x900 (DPR 2 for the rail), phone 375x812 at DPR 2 with touch, a
mobile user agent and the notch forced through CDP (47 top, 34 bottom), light and
dark. Scripts and shots are in the session scratchpad, `scratchpad/140/`
(`capture.mjs`, `look-rail.mjs`, `probe-spring.mjs`, `hits.mjs`,
`confirm-focus.mjs`; images in `before/`). Not committed.

What a person saw go wrong, measured:

- **The rail wore other yellows beside the primary.** The plate, its hover, the
  soft plate, the range track and the field's focus were `rgb(255 213 11)` at
  alphas 0.1, 0.14, 0.15, 0.08, 0.2, 0.72 and 0.32; the selected label turned
  `#ffe35c` on hover (D4 says a hover never moves the ink); the export button's
  hover was `#ffd326` and its ink `#181713`. The tokens are `--color-primary`
  `#f1be01`, `--color-primary-hover` `#f5c92a` and `--color-on-primary` `#1c1b19`.
- **The island closed on its last control.** `probe-spring.mjs` samples the width
  every frame through each row swap. Going to a narrower row the island's edge
  dipped inside the row's right edge by 2.2px (Motion to the root row), 2.3px
  (Look to the root row), 4.1px (the root row to Social) and 6.8px (Export to
  the root row, cutting the export pill's cap), because the 205/22 spring
  (damping ratio 0.77) overshoots by 2.3% of the move: 4.3px of a 188px swap and
  8.8px of a 382px one, and `overflow: hidden` is the clip. At rest the row ended
  2px from the island's right edge and 6px from its left: a constant
  (`ISLAND_PADDING = 8`) stood for a padding of 12.
- **The replace question.** Opened by keyboard as a modal, focus lands on its card
  (a `tabindex="-1"` div) and `:focus-visible` matches: `2px solid` accent at 2px
  offset round the whole card, because Tailwind's `outline-none` is layered and
  the global `:focus-visible` rule is not. Tab then walked Keep, Open the file,
  the browser, and the scrim: a `fixed inset-0` button whose ring falls outside
  the window, so a focus stop that showed nothing. The confirm button carried
  `inset 0 1px 0 rgb(255 255 255 / 0.3), 0 4px 16px -4px rgb(241 190 1 / 0.45)`.
  The card was `bg-neutral-50` with a 1px `neutral-200` border inside a white
  card with its own border, so two surfaces. The strip an import link raises is
  rendered beside the shell, outside `.studio-root`, so it read Tailwind's cold
  default (`oklch(0.985 0 0)`, and `oklab(0.145 0 0 / 0.4)` in dark) instead of
  the warm ramp, wore a raw `0 16px 40px -12px rgb(0 0 0 / 0.28)`, and started
  12px from the top, inside a 47px inset. Both buttons were 32px tall with no
  reach.
- **The island under a thumb** (375x812, three scenes, `hits.mjs`: the box of every
  point where `elementFromPoint` finds the control). Play 39x40, each scene dot
  24x40, Settings 35x40, Social 36x40, Export 65x31 (box 64.6x30, with no
  extension at all). The island was 270x40; four dots fit.
- **The menus.** The source menu, its two popovers and the project menu were the
  88% paper over an 18px blur: on a phone the stage's mesh showed through the
  lower rows as a soft orange and grey blotch
  (`before/phone375-light-11-source-menu.png`), and on a desktop through the
  popover that asks the replace question
  (`before/desktop-light-13-confirm-in-popover.png`).

### Decisions

Foundations (`emil-design-foundations`):

- **The rail's selected segment wears the primary the way the export button
  does.** Every literal yellow of a `.si-*` rule is `color-mix(in oklch,
  var(--camera-amber) N%, transparent)` at the alpha it had, so the plate is
  `oklch(0.8238 0.1682 89.03 / 0.1)` with a 0.14 ring, 0.15 on hover. It stays a
  well, not a fill: the export button is the zone's one filled shape (D2). The
  button's hover and ink are the tokens, `rgb(245, 201, 42)` and `rgb(28, 27,
  25)`. A hover moves the plate and never the label (D4): the label is
  `var(--camera-amber)` on hover, restated because the app's selected-hover rule
  paints the dark ink of a white plate and would vanish on the well.
  `SYSTEM.md` Colour row updated.
- **The island's spring never crosses its target** (table below). The landing keeps
  its own: its rows differ by a few pixels (0 and 1px in the swaps sampled, 24px
  in the take its comment cites), so its 1.4% overshoot is under half a pixel
  against 6px of slack, and its comment asks for the bounce.
- **The island's padding is read from the stylesheet**, not written in the
  component: `sidePadding` adds the computed padding to the row's width. The
  desktop island ends 3px after the export pill, concentric with it (capsule 20 =
  pill 17 + 3; it was 2px by accident), the phone's plate 6px (24 = 18 + 6).
- **The replace question is one card, `.sc-confirm`**, on `--camera-surface` with
  `--camera-raised`, `--r-surface`, its title 13px at 600 and its text 12px at
  1.5, read from the studio's scale. Its buttons are 32px at `--r-control` (their
  corners are 16px from the card's, so concentric would be square), one filled
  shape with no glow, a transparent ghost beside it that takes `--camera-pill` on
  hover. A host that is a surface flattens it (the popover, the modal); the modal's
  card is `.sc-confirm-card` with `--camera-material-shadow`; its scrim is the
  sheets' (`.sc-confirm-scrim`, pinned equal by a test); the strip is
  `.sc-confirm-float` inside `studio-root sc-tokens`, which hands it the warm ramp
  and the camera tokens it is rendered outside of.
- **Menus that hold text take the opaque studio surface** (D6): `background:
  var(--camera-surface)`, the same ring and shadow, no blur, since nothing is
  left behind an opaque fill to blur. The capsules and the easing popover keep
  the material. DECISIONS D5 amended in one sentence; `SYSTEM.md` rows updated.
- **Touch** (D10). Under `(pointer: coarse) and (max-width: 639px)`, scoped to
  `.sc-root-mobile`: a 48px plate, every root-row control a 44px cell with no gap
  (36px tall, 48px of reach), the dots as cells too, the 7px spacer gone, Export
  36px tall with a 6px extension. The landing took the same step with gaps; this
  row has more to hold, so it tiles. The dots that fit are `dotBudget`: 237px of
  transport, settings, social, export, padding and gutters, then 44px each, so
  three from 369px of screen (375 and 390), two from 325 (360), four from 413
  (430), none at 320, and the counter says the position past them. Below 360
  the bar goes first.

Surfaces (`emil-surfaces`): shadows over borders (the card and the menus carry a
ring inside a stack, no border); concentric radii checked at both capsules
(above) and the card; dark carries the same tokens (`--camera-surface`
`#1e1c1a` on the page's `#121110`).

Polish (`emil-ui-polish`):

- The scrim is `tabindex="-1"` and `aria-hidden`: it is for a pointer, and a
  keyboard leaves by Escape or "Keep my snippet". The card draws no ring
  (`.sc-confirm-card:focus-visible { outline: none }`, D9's container rule);
  the buttons keep the global accent ring.
- The confirm's buttons are 32px drawn, 40px of reach to a pointer, 44px tall
  under a finger.
- The import strip starts at `max(0.75rem, env(safe-area-inset-top))` (D14).
- A dot under a finger is `--r-pill`, so the ring a keyboard draws on it follows
  the capsule.

Craft (`craft-design-engineering`): Nested Border Radius (the two capsules and
the card, above), Hit Areas (cells tile: no dead gap between targets; the
confirm's two buttons reach only up and down), Shadows, Not Borders, Button Press
kept at 0.97 (this system's value, SYSTEM.md Motion), Interruptibility (a spring
keeps its velocity when a swap reverses).

Motion (`emil-animations`; no `review-animations` run, the table is the hand-off):

| Element | Trigger | Properties | Duration, curve | Reduced motion |
| --- | --- | --- | --- | --- |
| Island width | a row swap | `width` to the row's width plus the island's padding (D8's one exception) | spring 400/40, mass 1, critically damped: 194ms to 90%, 400 to 433ms to within half a pixel | `{ duration: 0 }` |
| Replace question, card | it appears, leaves | opacity, y 6 to 0 / 0 to -4 | 180ms `cubic-bezier(0.23, 1, 0.32, 1)` (unchanged) | opacity only |
| Replace question, modal | open, close | opacity, scale 0.97 to 1, y 8 to 0, blur 4px to 0 / the reverse | 220ms, the same curve (unchanged) | opacity only |
| Replace question, buttons | hover, press | background-color, color / transform | 150ms `var(--ease-out)`, only on a hover device / `whileTap` 0.97 on `springs.snappy` | colour kept, no press movement |
| Rail, selected well | hover | `background-color` of the plate, 0.1 to 0.15 alpha | none (a frequent control answers at once) | n/a |

The spring, measured in the browser (`probe-spring.mjs`, every frame of each swap)
and by a model that reproduces the old numbers (`tests/presentation/island-motion.test.ts`):

| | Stiffness | Damping | Mass | Damping ratio | Past its target, 188px / 382px | 90% of a move | Within 0.5px, 188px / 382px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Studio before (`springs.default`) | 205 | 22 | 1 | 0.77 | 4.3px / 8.8px (measured 4.33 / 8.80) | 200ms | 536ms / 563ms (measured 531 to 550) |
| Landing (`instrument.tsx`) | 260 | 26 | 1 | 0.81 | 2.6px / 5.3px (1.4% of the move) | 186ms | 484ms / 518ms |
| Studio after (`island-motion.ts`) | 400 | 40 | 1 | 1.00 | 0 / 0 | 194ms | 407ms / 447ms (measured 399 to 433) |

The landing's rows differ by a few pixels, so its dip stays under half a pixel
and its 6px of slack absorbs it (0.02px past its target in the widest swap
sampled, 1px). The studio's rows differ by up to 382px. Critical damping is the
least that never overshoots, so 400 is also the quickest safe stiffness; it keeps
the old rise time (200ms) and settles about 120ms sooner.

### After

`scratchpad/140/after/`, the same states, light and dark: the rail
(`rail-*`), the replace question in its four hosts (`desktop-*-13`, `-20`, `-21`,
`-22`, `-30`, `-40`, `-41` and `phone375-*`), the island on a phone at 320, 360,
375, 390 and 430 (`phone-<width>-island-<scenes>.png`), keyboard focus on its
cells (`phone-375-focus-*`), and the menus (`desktop-*-10`, `-11`, `-12`,
`phone375-*-10` to `-12`).

- Rail: plate `oklch(0.8238 0.1682 89.03 / 0.1)`, the label `rgb(241, 190, 1)`
  at rest and on hover; export hover `rgb(245, 201, 42)`; island padding 6px and
  3px. Past-target 0 at every swap (`probe-spring.mjs after`): the island's edge
  stays at least 3px outside the row, where it dipped 6.8px inside before.
- Replace question, by keyboard (`confirm-focus.mjs`, `capture.mjs`): it opens with
  focus on the card and no ring anywhere; Tab puts a 2px accent ring on "Keep my
  snippet" and nothing else, then on "Open the file" and nothing else; the next
  Tab leaves the page and the one after comes back to "Keep my snippet", never to
  the scrim. The confirm button's `box-shadow` is `none`, the inner card has no
  border and a transparent fill, the strip reads `rgb(255, 255, 255)` (dark
  `rgb(30, 28, 26)`) with the material's shadow and no border, and starts at 47px
  under the notch.
- Island under a thumb (`hits.mjs`, 375x812, three scenes): Play 50x48, each dot
  44x48, Settings 44x48, Social 44x48, Export 68x48 (box 60.6x36); the island is
  337x48 at x = 19. At 390 the same; at 360 two dots (island 293), three scenes
  show the counter (327, inside 328); at 320 the counter and no bar (255); at 430
  four dots (381). Four scenes at 375: the counter (327).
- Menus: `.sc-source-menu`, `.sc-source-form-popover` and `.sc-project-menu` compute
  an opaque fill (alpha 1) and `backdrop-filter: none`, light and dark.

Tests, each seen red first on the baseline build or with the code absent:

- `tests/presentation/studio-surfaces-system.test.ts`: the menus' fill and blur
  (3 red), the rail's literals, plate and hover ink (3 red), the replace
  question's rules, card, glow, ring and 44px reach (5 red, no rules yet), the
  phone island's cell (1 red, a missing export). The export button's tokens were
  asserted with the rail's fix and checked against HEAD's stylesheet, which still
  holds `#ffd326` and `#181713`. The radius test of that file went red for the
  capture library's raw px while #142 worked, and is theirs.
- `tests/presentation/island-motion.test.ts` (4, red on a missing module),
  `playback-readout.test.ts` (`dotBudget`, 4 red), `import-guards.test.tsx` (the
  replace question's markup and the overlay's tab stops, 3 red).
- E2E, red against the baseline build, green on the final one:
  `studio-shell.spec.ts` (the island never gets narrower than its row: -6.8px;
  the row ends where the padding says: 2 against 6; the menus are opaque on the
  desktop, light and dark: alpha 0.88 and `blur(18px) saturate(1.4)` before),
  `mobile-shell.spec.ts` (the menus are opaque, light and dark; the island's
  targets at 375 and 390: "Play reaches 39 wide"; past its dots the island keeps
  its targets and its fit; the replace question's buttons: "reaches 33 tall"; the
  import strip clears the notch: 12 against 47), `imports.spec.ts` (keyboard focus in the replace
  question: a ring on the card at open; the strip an import link raises is the
  studio's surface in both themes: `oklch(0.985 0 0)` and `oklab(0.145 0 0 / 0.4)`
  against `rgb(255, 255, 255)` and `rgb(30, 28, 26)`).
- `pnpm exec vitest run tests/docs/design-system.test.ts
  tests/presentation/studio-surfaces-system.test.ts
  tests/application/phone-sheet.test.ts tests/presentation/island-motion.test.ts
  tests/presentation/playback-readout.test.ts
  tests/presentation/import-guards.test.tsx
  tests/presentation/studio-control-rail.test.tsx
  tests/presentation/export-render-cta.test.tsx
  tests/presentation/playback-render-isolation.test.tsx
  tests/presentation/source-import-replacement.test.tsx
  tests/presentation/template-gallery-preview.test.tsx
  tests/presentation/mobile-shell.test.tsx
  tests/presentation/studio-source-hub.test.tsx
  tests/presentation/layer-editor-in-sheet.test.ts`: 14 files, 140 tests, green.
- `E2E_SKIP_BUILD=1 E2E_PORT=5234 E2E_OUT_DIR=<scratchpad>/dist pnpm exec playwright
  test mobile-shell studio-shell imports showcase studio-authoring landing`:
  6 spec files, 37 passed.

### Review verdict

`emil-ui-review` on the diff: **approve with changes**. Should fix, both done:

- The replace question's two buttons were claimed 44px under a finger by the
  stylesheet and measured by nothing: `mobile-shell.spec.ts` now reads their reach
  by `elementFromPoint` (33 tall before, 44 after).
- `ConfirmDiscard`'s `className` said "outer spacing only" while the strip passes
  its lift through it: the comment says spacing, width and lift.

Accepted, not findings: the island's `width` is a layout property
(D8's one sanctioned exception, now on a critically damped spring); Tab leaves
the page after "Open the file", as a modal does.

Nits left: the root row has no gap between the playback group and the settings
group on a phone (the cells are the spacing); the dots read as sparse at 44px
cells.

## Open

- A diff paste that is not a diff is asked about ("Replace what you have with
  this code?") before it is known to be readable, as the file was. Reading it
  first means parsing in the menu; left for the import owner.
- The phone status keeps the 36px plate and 660px width (U4).
- After the replace question's modal closes, focus lands on `body`: the menu row
  that opened it is gone. `ConfirmDiscardOverlay` could hand focus back to the
  Add source trigger; left for the source hub.
- On a phone the island's second storey and its social row are not at 44px: the
  cluster sheet's tabs and chips are 30px tall with 40px of reach, and the feed
  chips ("Off" 33px, "X" 30px wide) cannot all reach 44 in 343px (seven chips
  take 290px at 30px). A second row or a scroller would; the phone pass.
- Landscape phones and tablets (640px and wider, a coarse pointer) keep the 35px
  pitch, the 24px dots and a 31px tall export button: there the budget is eight
  dots in 24px cells, and 44px cells need a different row.
- Three dots at 375: a project of four scenes or more shows the counter and the
  bar, where it showed four dots; seeking past three is the Scenes list.
  Pivot: "keep four dots" needs the export button as a glyph or a second row.
- The phone's More menu (Drift 19) is 98% white over a blur with a cool border:
  it takes the opaque surface (D5) with the next phone pass.
- Reduced transparency and forced colours were read from the stylesheet, not
  seen: the opaque menus no longer depend on the first, the capsules still do.
- Not verified on a device: the notch and the home indicator were forced through
  CDP, and the reach numbers are `elementFromPoint`, not a thumb on glass.
