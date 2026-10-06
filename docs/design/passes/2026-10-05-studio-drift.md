# Pass: the studio's remaining surfaces, 2026-10-05

## Screen

Ticket #139, decision log `docs/decisions/2026-10-05-next-wave.md` D1 and D4.
Route `/app`, both shells (desktop 1440x900, phone 375x812), light and dark.

- **The source hub**: `layout/studio-source-hub.tsx`, `url-import-menu.tsx`,
  `diff-import-menu.tsx`, the new `source-popover-motion.ts`; the `.sc-source-*`
  and `.sc-island-trigger` rules of `src/presentation/studio-camera.css`, and
  the phone's resources island in `src/app.css`.
- **The showcase**: `layout/template-gallery.tsx` and its rules, `.showcase-*`
  and the `.studio-sheet-*` shell it shares with the capture library.
- **The drop veil**: `.sc-drop-veil`, which both shells draw.
- Drift rows 5, 8, 9, 12, 13, 15 and 17 of `docs/design/SYSTEM.md`, the header's
  Add source and Showcase glyphs, the phone root's overflow, the unused spring,
  the chrome mono comment.

Out of scope: the capture library's own rules (`.capture-*`, ticket #142), the
export dock and the island (#140), the phone sheet (#141), the landing (#143),
the account island (#144).

## Before

Production build served by `vite preview` on 5231, shot with the ms-playwright
Chromium (`scratchpad/139/capture.mjs`): 1440x900 at DPR 1, and 375x812 at DPR
2 with touch, a mobile user agent and the notch forced through CDP
`Emulation.setSafeAreaInsetsOverride` (47 top, 34 bottom). Per theme: the
studio, the Add source menu, the link popover (empty and refused), the diff
popover, the Showcase grid (and a hovered card on desktop), the drop veil, the
replace question inside the hub, the replace question inside the Showcase. 38
images and the phone's project menu in `scratchpad/139/before/`
(`<shell>-<theme>-NN-<state>.png`), and the computed values in
`probe-desktop.json` and `probe-phone.json`. Not committed.

Values the three surfaces wrote themselves (probe, desktop light):

- Radii: menu 18px, row 14px, icon tile 7px, popover 18px, back button 9px,
  link field and Fetch 12px, sheet 24px, card 18px, picture 17px 17px 13px
  13px, safe zone 11px, veil 22px, veil label 12px, trigger 20px.
- Type: trigger 11.5px, sheet title 14px at 680, card title at 660, card
  action at 620, feature line 8.5px, veil label 13px at 560.
- Timing: card 160ms, picture 220ms (a 0.6% scale and a 4% saturation), live
  layer 120ms, arrow 180ms, veil 140ms `ease-out`. The reduced-motion blocks
  set `transition: none` on the sheet, the card, the island's buttons and the
  status fill, which also removed the colour fades the global allow-list keeps.
- Material: the menu, the popovers, the sheet (`#f9fafc`, `#151517`), the card
  and the triggers were `#fff`, `#1b1c20` and cool greys, beside the warm
  `--camera-material` of the project menu. The sheet's scrim was `rgb(27 27 30
  / 0.38)`. Press scales 0.96 on Fetch, Apply and the segment, 0.985 on a row.

What a person saw go wrong, measured:

- **The phone's project menu painted no background.** `.sc-project-menu` reads
  `--camera-material`, and the phone root carried six of the desktop's camera
  tokens (cool copies in app.css) and none of its material or shadow: fill
  `rgba(0, 0, 0, 0)`, shadow `none`. The stage showed through its rows.
- **The phone's root scrolled.** `.sc-root` was `overflow: hidden`: with a
  200px overhang `scrollLeft = 200` stuck at 200. The desktop root clips.
- **The Showcase poster ran at double leading.** Shiki's newline text nodes
  each drew a blank line in a block `code`: 22.31px between lines for 11.16px
  of leading. On hover the live frames printed over it, so two frames of code
  overlapped.
- **The Showcase's replace question was clipped on a short phone.** At 375x667
  the sheet is 74% of the screen (173 to 667) and "Open example" sat at 739 to
  771, under `overflow: hidden`, which a thumb cannot scroll. At 375x812 it sat
  inside the home indicator's band.
- **The sheet's close button was squeezed.** 26.7px wide by 34px tall on the
  phone: a flex item shrinking under a wrapping subtitle.
- **Fields.** The link field and the diff box had a neutral border that moved
  from 200 to 300 on focus and a Tailwind `outline-none`, so the only ring was
  the global one at a 2px offset; the segment said "on" by colour alone; Fetch
  and Apply dropped to 60% opacity when disabled and when busy, the same
  olive-on-paper pill for two different states.
- **Targets.** The back button was 30px (40 reached), the sheet's close 34px, the
  segment 24px, Fetch and Apply 32px under a finger.
- **The drop veil** was two copies of one rule (desktop, phone), its blue
  `rgb(47 128 255)` a second blue beside the accent, its label on `#fff`.

## Decisions

Foundations (`emil-design-foundations`):

- One token set on both shells. The colour, material, shadow and type tokens
  moved out of `.studio-camera-root` into one rule,
  `:is(.studio-camera-root, .sc-root-mobile)`, and the phone root's cool copy in
  app.css is gone (only the portaled sheet keeps one, Drift 18). This fixes the
  phone's project menu (fill `oklch(0.985 0.0013 none / 0.88)`, ring and shadow,
  16px) and gives the phone the type scale. The phone root's keyboard focus ring
  is now the accent (D9) instead of ink.
- Two roles the surfaces needed and the tokens lacked: `--camera-danger`
  (`#c53a3a`, dark `#f28b82`, 5.0:1 and 7.3:1) for a refusal's ink, and
  `--camera-sheet-shadow` (a ring and a shadow cast upward) for a bottom sheet.
- Radii, each a token or a `calc()` of one (D3): menu `--r-surface` 16px, its
  rows `calc(var(--r-surface) - 4px)` 12px, the icon tile `calc(var(--r-surface)
  - 11px)` 5px, popovers 16px, the back button, the field and Fetch `calc(var(
  --r-surface) - 9px)` 7px, triggers `--r-pill`, sheet `--r-sheet` 20px, card
  16px, picture `--r-surface` over `--r-control` 10px, safe zone 10px, veil
  `--r-sheet` 20px with a `--r-surface` label.
- Type from the scale (Drift 9): trigger 12px at 600, menu title 12px at 600
  and detail 11px, sheet title 13px at 650, card title 12px at 650, feature line
  9px with tabular digits, action 10px at 600, the confirm's title 13px at 650
  (it was 18px at 700: the studio has no display size, and a 13px head sits with
  the inspector heads), veil label 13px at 600.
- Timing (Drift 12): 150ms `var(--ease-out)` on every transition of the three
  surfaces, including the veil (was 140ms `ease-out`).
- Reduced motion (Drift 8): the sheet and showcase block and the island's
  `transition: none` rules are deleted, and so is the status fill's, which killed
  nothing but was the same pattern. The global allow-list is the whole rule.
- The phone root clips, `overflow: clip` (Drift 17, D15). The unused `bouncy`
  spring is deleted (Drift 13). `CHROME_FONT_STACK` keeps JetBrains Mono, and
  its comment, with the two that repeated it, now says why: the bar is video
  content, not studio chrome (Drift 15).
- The header's Add source and Showcase glyphs are 14px, beside 12px text
  (1.17em), and the Showcase glyph loses its 1.65 stroke so the three triggers
  share one weight.
- One veil for both shells, with the phone's safe-area inset (D14), the accent
  for its dashed edge and 5% tint, an opaque `--camera-surface` label.
- A sheet's header and content share one side gutter, `--sheet-inline` (28px,
  18px for the showcase, 16px on a phone), clear of a landscape notch, with the
  grid's bottom padding clear of the home indicator. The title now sits on the
  first card's left edge (it was 28px against 18px, then 12px on a phone).
- The Showcase's replace question scrolls inside the sheet (`min-height: 0`,
  `overflow-y: auto`), so a short phone can reach "Open example".
- The poster is a flex column, as the landing's static frames are, and steps
  aside (opacity 0, 150ms) once its card plays its own frames. The picture's
  hover scale and saturation are deleted: below what an eye reads.

Surfaces (`emil-surfaces`, the material skill):

- Menus and popovers wear the floating material (D5): `--camera-material`,
  `--camera-material-shadow`, the blur, 16px, no border. The header triggers take
  the fill, ring and shadow without the blur (they sit on flat paper). Reduced
  transparency makes the material opaque (`--camera-material:
  var(--camera-paper)`), since the global rule only dropped the blur and left an
  unblurred 12% of the scene behind every menu.
- The showcase card is the opaque card: `--camera-surface`, `--camera-raised`
  (a ring inside the stack, no border), and on hover the floating material's
  depth, one `box-shadow` transition. The sheet is `--camera-paper` with
  `--camera-sheet-shadow`; its scrim is the dark paper at 40%, the one
  `ConfirmDiscardOverlay` draws.
- Icon tiles are `--camera-surface` with an inset hairline, so they stay visible
  on a hovered row (`--camera-pill`). Ghost icon buttons (back, close) are
  transparent until hovered and answer a press with the hover fill (D2).
- The portrait stage's highlight is an eased nine-stop gradient (a straight fade
  over this width banded on the dark ground).

Polish (`emil-ui-polish`):

- Fetch, Apply: 32px drawn, a pseudo-element to 40px for a mouse and 44px
  tall under a finger; the segment extends 8px up and down (10px under a
  finger, where its 8px gaps allow 38px); the back button 40px, 44px under a
  finger; the close 44px. Measured by `elementFromPoint`: 39, 39 and 43.
- Fields: `outline: 2px solid transparent` (forced colours still draw a ring),
  accent border and a 3px 16% halo on focus, the danger colour when refused
  (`aria-invalid`); 16px and 44px tall under a coarse pointer. The focus border
  was the accent at 60%, 2.1:1 against the paper; D9 asks 3:1, and the whole
  accent measures 3.6:1.
- Fetch and Apply: disabled is a muted fill (`--camera-pill`, `--camera-muted`),
  busy keeps the primary and `cursor: progress` (`aria-busy`), as the export
  button does. The inset highlight is gone: one flat primary.
- The segment is a `fieldset` named "Play as", its buttons `aria-pressed`, its
  plate on `springs.snappy` (was a local spring).
- The close button is `flex: none`. The trigger's icon side is 2px tighter
  (`0 15px 0 13px`). `text-wrap: pretty` on the sheet's subtitle and the
  confirm's text, `balance` on its title.

Craft (`craft-design-engineering`):

- Button Press: 0.97 on every control, 0.985 kept on the showcase card (a
  larger surface takes a smaller amount; recorded in SYSTEM.md, Motion).
- Nested Border Radius: the derived radii above, each with its inset in the
  comment. Hit Areas, Optical Alignment, Text Wrapping, Tabular Numbers and
  Icons (14px beside 12px text) as above. Shadows, Not Borders: the card and the
  menus, ring inside the stack.
- Checked and kept: the popovers' scale entrance (0.97 from the top left),
  exits at 120ms on an ease-in, the segment's shared layout plate.

Motion (`emil-animations`):

| Element | Trigger | Property | Duration and curve | Reduced motion |
| --- | --- | --- | --- | --- |
| Menu and form popovers | open, close | opacity, y -5, scale 0.97, blur 4px / opacity, y -3, scale 0.98, blur 2px | 180ms `[0.23, 1, 0.32, 1]` / 120ms `[0.4, 0, 1, 1]`, origin top left | opacity only, 10ms |
| Menu row, trigger, ghost button | hover, press | background-color, color / transform | 150ms `var(--ease-out)`; press scale 0.97 | colour kept, press `transform: none` |
| Fetch, Apply, the segment | press | transform (Motion `whileTap`) | `springs.snappy`, scale 0.97 | no movement |
| Segment plate | choose | `layoutId` glide | `springs.snappy` | 0ms |
| Field | focus | border-color, box-shadow | 150ms `var(--ease-out)` | kept |
| Showcase card | hover | box-shadow | 150ms `var(--ease-out)` | kept |
| Showcase card | press | transform (Motion `whileTap`) | `springs.snappy`, scale 0.985 | no movement |
| Poster and live layer | the card starts playing | opacity (poster 1 to 0, live 0 to 1) | 150ms `var(--ease-out)` each | no live layer |
| Motion dot, arrow | hover | background-color, box-shadow / transform | 150ms `var(--ease-out)` | colour kept |
| Sheet and scrim | open, close | transform y, opacity | 300ms / 210ms `[0.32, 0.72, 0, 1]` (unchanged) | 0ms |
| Drop veil | a file enters | opacity | 150ms `var(--ease-out)` | kept (opacity) |

Nothing animates a layout property. Deleted: the picture's 220ms scale and
filter, every local `transition: none`.

Standing rules, `docs/design/DECISIONS.md` (budget: its test caps it under 300
lines, it is at 294):

- D14 (phone chrome clears the safe areas) and D15 (a full-window root clips)
  were already written there, so they are amended rather than duplicated: D15's
  enforcement now names the phone's root, its two e2e specs and the stylesheet
  test; D14 gains a sheet's gutters. D2 gains the hero exception from the
  landing pass and the popover as a zone; D3 stops pointing at Drift 5 for the
  showcase and the source hub; D5 gains the opaque material under reduced
  transparency; D8 says the global allow-list is the whole rule; D6 gains the
  landing's error fallback keeping its document chrome (the landing follow-up's
  line).
- `docs/decisions/2026-08-09-hero-direction.md` line 11 now carries the
  stylesheet's `clamp(2rem, 1.2rem + 3vw, 3.25rem)` (Drift 14); SYSTEM.md Drift 7's
  press value lives in the Motion table, and the two app.css comments that cited
  the deleted row point there.

`docs/design/SYSTEM.md`: new rows for the error ink, the sheet shadow, the sheet
gutter, the fan row's bleed, the derived radii, the press, the popovers' motion,
`select-none` and the touch targets; Drift 8, 12, 13, 14, 15 and 17 deleted;
Drift 5 and 9 narrowed to what remains (the capture library, the phone's More
menu, the timeline's panels, the project menu); Drift 18 (the phone sheet's cool
token copy) and 19 (the phone's More menu) added.

## After

The same shots and script, `scratchpad/139/after/` (42 images: the 38 of the
before set, a hovered menu row on desktop in both themes, and
`phone-{light,dark}-10-project-menu.png` for the phone menu that painted
nothing), with `probe-desktop.json` and `probe-phone.json`.

- Probe, desktop light: trigger 12px at 600 with a 999px radius and 14px glyphs
  (Add source and Showcase were 13px); menu 16px, row 12px, tile 5px; popover
  16px, back 7px, field and Fetch 7px; sheet 20px, card 16px, picture 16px 16px
  10px 10px, card transition `box-shadow 0.15s`; veil 20px, label 16px at 600,
  `0.15s`. The phone's root: `overflow: clip`. The phone's close button 34 x 34.
- Showcase poster: line pitch equals its leading in the browser
  (`tests/e2e/showcase.spec.ts`), and its opacity is 0 while the card plays.
- Hit areas by `elementFromPoint` on the phone: back 43 x 43, Apply 54 x 44,
  segment 38 tall, close 43 x 44, header triggers 30 x 51. Title left edge 16,
  first card 16 (desktop 18 and 18).
- Short phone (375x667): the replace question's nearest scroller is the
  confirm block, `overflow-y: auto`.

Tests, each seen red first:

- New `tests/presentation/studio-surfaces-system.test.ts` (7): the three
  surfaces' radii, sizes and weights come from the tokens, their transitions are
  150ms, no reduced-motion block sets `transition: none`, the roots clip. Five
  red at the start (20 radii, 25 sizes, 7 timings, 3 overrides, `hidden`).
- New `tests/presentation/source-popover-motion.test.ts` (3, red on a missing
  module). Extended `studio-source-hub.test.tsx` (glyph 14px, segment
  `aria-pressed` and its group, busy Fetch; the last two red with the attributes
  removed) and `template-gallery-preview.test.tsx` (glyph 14px).
- E2E, red against the baseline build, green on the final one:
  `mobile-shell.spec.ts` (the root clips: scrollLeft 200 became 0; a menu paints
  its material: `rgba(0, 0, 0, 0)`; a short phone can answer the replace
  question), new `showcase.spec.ts` (poster pitch 22.31px against 11.16px of
  leading; the poster steps aside).
- `pnpm exec vitest run tests/docs/design-system.test.ts
  tests/application/phone-sheet.test.ts tests/presentation/studio-surfaces-system.test.ts
  tests/presentation/source-popover-motion.test.ts
  tests/presentation/studio-source-hub.test.tsx
  tests/presentation/template-gallery-preview.test.tsx
  tests/presentation/import-guards.test.tsx
  tests/presentation/source-import-replacement.test.tsx
  tests/presentation/capture-library.test.tsx
  tests/presentation/mobile-shell.test.tsx
  tests/presentation/use-studio-file-drop.test.tsx
  tests/presentation/studio-bottom-sheet-motion.test.ts`: green.
- `E2E_SKIP_BUILD=1 E2E_PORT=5231 pnpm e2e` on `showcase`, `mobile-shell`,
  `studio-shell`, `imports` and `studio-authoring`: 14 passed.
- `pnpm check-types` and `pnpm exec biome check` on the changed files: clean.

## Review verdict

`emil-ui-review` on the diff: **approve with changes**. Should fix, all done:

1. A focused field's border was the accent at 60%: 2.1:1 against the paper,
   under the 3:1 D9 and WCAG 1.4.11 ask. Now the whole accent (3.6:1).
2. The coarse-pointer overrides sat above the base rules they override, so the
   44px controls and the 16px field never applied below them. Moved below.
3. The three popovers each wrote their own motion (0.97 and 0.96 scales, a blur
   that survived reduced motion): one `sourcePopoverMotion`.
4. The header triggers carried a backdrop blur over flat paper (D5): removed.
5. The segment had no group name and said "on" by colour: `fieldset`,
   `aria-pressed`.
6. The close button shrank to an oval on the phone: `flex: none`.

Nits left: the menu's rows are 4px apart, so a pointer crosses a dead strip
between two hovers (Craft, Hit Areas, gaps); the material shows blurred
shapes of the stage behind the source menu on a phone (see Open).

## Open

- **The material over the stage.** The source menu and its popovers wear the
  88% paper with an 18px blur (D5, as the project menu does). On a phone they
  cover the stage, and the 12% that shows through leaves a soft blotch behind
  the rows (the code card, the mesh). Text stays above 7:1. If it reads as dirt
  on a device, the one-line answer is `background: var(--camera-surface)` on
  `.sc-source-menu` and `.sc-source-form-popover`, a doctrine call for D5.
- **The capture library** shares the sheet shell and so already has the 20px
  top radius, the warm paper, the ghost close and the gutter; its own rules keep
  their raw values (Drift 5 and 9, #142). The showcase is also the full window
  wide at 1440 (cards of 696px); sizing the sheet to its content, as #142 asks
  for the library, may suit both.
- **The inspector's field focus** is the same accent at 60% with a halo
  (`.sc-layer-field`, the desktop pass): 2.1:1, under D9's 3:1. Not touched here.
- **Drift 18 and 19** (the phone sheet's cool token copy and ink ring, the
  phone's More menu) are written down, not fixed.
- **`ConfirmDiscard`** still wears Tailwind neutrals and the glow shadow inside
  the popover and the Showcase's confirm (ticket #140's list).
- **The standalone variants** of `UrlImportMenu` and `DiffImportMenu` (their own
  trigger, a Tailwind surface) are exercised by tests only; the studio renders
  them embedded. A candidate for deletion with its tests.
- **Not verified in a browser:** reduced transparency (the opaque material is
  read from the stylesheet), forced colours, real hardware (the notch and the
  home indicator were forced through CDP).
