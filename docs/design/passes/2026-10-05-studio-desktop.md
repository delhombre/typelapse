# Pass: the studio desktop shell, 2026-10-05

## Screen

Ticket #133, decision log `docs/decisions/2026-10-05-ui-passes.md` D2 to D4.
Route `/app` on the desktop shell, light and dark: the scene shell and its
header capsules (`scene-shell.tsx`, `project-chip.tsx`,
`studio-history-controls.tsx`, `studio-utilities.tsx`), the island plate, the
code card with the step builder's scene inspector and the layer inspectors
(`scene-code-card.tsx`, `editor/step-builder.tsx`, `editor/studio-editor.tsx`,
`editor/studio-layer-strip.tsx`), the timeline (`timeline/studio-timeline.tsx`,
`timeline/easing-editor.tsx`, `ui/scene-duration-input.tsx`,
`ui/scene-deletion-undo.tsx`), and the studio rules of
`src/presentation/studio-camera.css` and `src/app.css`.

Out of scope: the export dock, the status pill, the source hub and the account
island (U3); the phone shell (U4); the preview card geometry and every
renderer. The capture library sheet (`capture-library.tsx`) was shot, not
changed: it is not in this pass's files.

## Before

Production build served by `vite preview` on 5302, shot with the ms-playwright
Chromium (`scratchpad/133/capture.cjs`) at 1440x900 and 1920x1080, light and
dark. The fixture is built through the UI on every run: a blank title card
("Ship the diff"), two code scenes, an image and a video layer on scene 3, a
4 s audio cue, loop on. 64 images in `scratchpad/133/before/`
(`<width>-<theme>-NN-<view>.png`: empty, code scene, timeline, header, text,
image, video and audio inspectors, loop band, morph controls, project menu,
library). Not committed.

- **The whole studio slid sideways.** With the card open the stage and the
  dock overhang the window (the dock box ended at 1598px in a 1440 window)
  and `.sc-root` was `overflow: hidden`, which is still a scroll container:
  one focus or scrollIntoView moved `main.studio-root` 155 to 158px left,
  under its own header, card cut in half.
- **Dark inspector text was invisible.** `.dark .studio-camera-root` never
  redefined `--camera-ink`, so field values, the selected chip and the
  inspector title painted `#1d1d20` on `#1b1c20` (audio fields read as empty).
- **Card, crowded.** Three labels for one thing ("TEXT Scene layer", then
  "TEXT LAYER", then "Text"); 9px capitals on every field label; Layout and
  Layers drawn as cards inside the card (13px radius inside 20px, a third
  fill); the 118px text box pushed Layout under the fold at 900px; Record,
  Blank and Capture at equal weight, repeated under every layer.
- **Chips.** The row scrolled sideways with a hidden scrollbar: the video and
  audio chips were cut at the card's edge with nothing saying more existed.
  On a scene change the shared audio chip slid across the others (`layout`).
- **Audio.** Two fields labelled "Volume" (a number, then a slider).
  W and H were announced as "W position percentage".
- **Inconsistent.** A cool paper (`#f9fafc`) and cool greys against the warm
  landing; a second yellow (`#ffd50b`); the rounded system face on Apple only;
  focus rings in ink; radii 6 to 20px written raw; hover at 120, 130 and
  150ms; presses at 0.92, 0.94 and 0.96; the island 42px with a border.
- **Timeline.** Clip labels at 8px, the duration value at 9px; layer marks a
  black lozenge on a light tile; the duration field ignored Enter although
  its key said "done"; a bad focus range was a red edge and nothing else.

## Decisions

Foundations (`emil-design-foundations`):

- `overflow: clip` on the studio root: clipping without a scroll container,
  so nothing can slide the scene. Red e2e first (`studio-shell.spec.ts`).
- Dark `--camera-ink: #f5f3ef`; one token fixes every dark field, chip and
  title. Red e2e first.
- Warm paper (coordinator call 3, D6; SYSTEM drift 3 deleted): paper, ink and
  pill read the warm stone ramp; muted is the landing's ash `#6e6b64`
  (4.87:1 on the pill, where the old grey measured 4.39:1); dark muted
  `#a8a39a` (5.96:1 on the dark pill).
- One primary (coordinator call 1): `--camera-amber: var(--color-primary)`;
  the island CTA and the timeline selection wear `#f1be01`. Drift 1 deleted.
- One ring and selection colour: `--camera-focus` and `--camera-accent` point
  at `--color-accent` (D9). Sliders and the checkbox stay in ink. Drift 2
  deleted.
- One face: Geist on the desktop as on the phone and the landing; the rounded
  system face only reached Apple screens. Drift 10 deleted.
- A studio type scale on the root, `--sc-text-2xs` to `--sc-text-lg`
  (9 to 13px) and three weights (500, 600, 650), applied to the shell's
  inspectors, chips, header and timeline context. Drift 9 narrowed.
- Labels are plain words in muted 11px; capitals stay on section heads only.
- The card head names the kind; the inspector names the layer (a text layer
  by its first line); the desktop hides the inspector's eyebrow.
- Layout and Layers are sections, not cards: no box, a hairline above Layout.
- Layout comes last for every kind. Record is a ghost, Capture the one
  outlined add. While a layer is open the add row leaves (navigation only).
- One Volume: a slider and its number under one label. W and H are named
  "Width percentage" and "Height percentage".
- The project menu's rows say how many scenes they hold; the head keeps "Saved
  on this device".

Forms (`emil-forms-and-inputs`): Enter finishes the duration field (blur
clamps and commits). A rejected focus range sets `aria-invalid` and names the
fix under the field ("Use line numbers, like 2-4, 7"), cleared on the next
keystroke. Placeholders show the format beside a label ("2-4, 7", "Shown
under the frame"); the phone's unlabelled rows keep theirs. Focus and caption
fields skip autocomplete; focus skips spellcheck. Field focus is the accent at
60% with a 3px 16% halo. 16px under a coarse pointer for the duration and
easing fields.

Surfaces (`emil-surfaces`; coordinator calls 6 and 11):

- Card and timeline: opaque `--camera-surface` with `--camera-raised`, a ring
  inside the shadow stack instead of a border. Opaque, not the frosted
  material: only flat paper sits behind them, so a blur costs a layer over
  Monaco and shows nothing.
- Header capsules, the project menu and the easing popover take the landing's
  material (`--camera-material`, D5). Drift 11 deleted.
- The island is the landing's plate: the studio override (42px, 3px padding,
  1px border, its own shadow) is gone, the app.css plate rules (40px, `0 6px`,
  no border, inset hairline on dark). The desktop keeps 34px labelled controls
  at a 2px gap; the end controls' targets reach the new 6px padding. Drift 6
  deleted.
- Radii from the scale: sheets `--r-sheet`, controls and preview tiles
  `--r-control`, fields `--r-field`, nested ones as `calc(parent - gap)`.
  `--camera-line: var(--sc-hairline)`: one hairline (drift 4 deleted).
- Clips, morph marks and layer marks read the tokens; the layer marks are a
  surface chip with a ring, not a blurred black lozenge. The menu thumbnail
  takes a 1px black or white 10% outline inside its bounds.

Polish (`emil-ui-polish`) and Craft (`craft-design-engineering`): colour
transitions at 150ms in the timeline (drift 12 narrowed); tabular digits on the
scene count, the number fields and the clip summary; header glyphs at 14px
beside 12px text (undo and redo were 15, utilities 13); Capture's hand-drawn
plus is Reicon's `Add`; the delete mark's target is 40px on a mouse and 44px
under a finger, the chips 44px under a finger; presses on the chips and the
project rows. Presses are 0.97 everywhere (coordinator call 7; the three app.css
0.96 rules included). The skills' grey ring and 0.96 press were overruled by
D9 and the coordinator.

Motion (`emil-animations`; `review-animations` is not installed, so the review
half was done on frames from the capture runs):

| What | Trigger | Properties | Duration and curve |
| --- | --- | --- | --- |
| Workspace mode plate | Preview or Edit | transform via `layoutId` | `springs.snappy` (400, 30); reduced: 0 |
| Card fold, tab | fold or unfold | x, scale, opacity | `springs.default` (205, 22); press 0.97 on `snappy` |
| Stage step back | fold | x, y, scale | `springs.default`; reduced: 0 |
| Shell arrival | first load only | opacity, x or y, scale 0.985 | `springs.gentle` (120, 18), delays 0 to 140ms |
| Project menu | open, close | opacity, y -5, scale 0.97, blur 4px | in 180ms `[0.23, 1, 0.32, 1]`, out 120ms `[0.4, 0, 1, 1]` |
| Utilities menu (compact) | open, close | opacity, y -4, scale 0.97, blur 3px | in 160ms `[0.23, 1, 0.32, 1]`, out 110ms `[0.4, 0, 1, 1]` |
| Easing popover | open, close | opacity, y 8, scale 0.985 | in 160ms `[0.22, 1, 0.36, 1]`, out 110ms `[0.4, 0, 1, 1]` |
| Timeline context swap | scene or morph | opacity, y 3, scale 0.985 | in 160ms, out 90ms (unchanged) |
| Scene deletion undo | delete | opacity, y 3, scale 0.985 | same as the context swap |
| Chip selection | press | background, border, color | 150ms `var(--ease-out)`; press 0.97 |
| Chip added or removed | a layer | opacity, scale 0.96 | in `springs.snappy`, out 100ms |
| Scene change in the card | select | none | instant: the most frequent move, often by keyboard |
| Clip reorder | drag release | transform (`layout="position"`) | spring 500, 42, mass 0.9; keyboard moves instant |
| Playhead | clock | transform via `--timeline-progress-shift` | none: written per tick, never transitioned |

Removed: `layout` on the chips, the strip's and the focus fields' 3px
entrance on every scene change, and the timeline's local reduced-motion
`transition: none` (drift 8 narrowed; presses still land without moving).
Nothing animates width, height, top or left.

## After

Same fixture and views, 64 images in `scratchpad/133/after/`; the runs
between skills in `run2/` to `run4/`. No sideways scroll was recorded in any
run after the clip.

- Unit: `tests/presentation/studio-desktop-fields.test.tsx` (new: Enter,
  the named focus error, the add row while a layer is open),
  `studio-editor-media-inspectors.test.tsx` (one Volume, the text title, W
  and H names), `project-chip.test.tsx` (scene count). Each seen red first.
- The brief's suites (studio-*, step-builder-*, multimedia-*,
  use-scene-deletion, shortcut-suppression, project-chip, blank-scene
  follow-ups, the parity suites readable-floor, canonical-card-width,
  plan-window, frame-painter*) and the design doc test: 43 files, 328 tests
  green. `pnpm check-types` clean.
- `pnpm e2e --grep "Studio"` with `E2E_SKIP_BUILD` against the final build:
  9 passed, including the new `tests/e2e/studio-shell.spec.ts` (red at
  155px of scroll and an ink sum of 90 before).

## Review verdict

`emil-ui-review` on the diff: **approve with changes**. Should fix: the
visible "Volume" word focused nothing (now a `label` for the number); the
desktop card's chips and delete mark stayed 29 and 28px under a finger (now
44px). Both done. Nits left: the timeline's Blank reads as a caption at rest
(kept quiet on purpose, ticket #96); `--camera-dark-shadow` has no caller.

## Open

- Monaco keeps its own near-black theme inside the warm dark card (editor
  theme, not this file set).
- Header neighbours: Add source and Showcase glyphs are 13px against the
  shell's 14px; the source hub and gallery still write raw radii and 120ms
  fades (U3, drift 5, 12).
- The capture library sheet (`capture-library.tsx`) is a full-width sheet
  with a small empty state; it needs its own pass.
- The phone sheet shares the inspector rules: plain labels, the flat
  Layout and Layers sections and the single Volume reach it too (U4 to
  check against its shots).
- A standing rule this pass would add to `DECISIONS.md`: a full-window root
  clips (`overflow: clip`), it never scrolls. Left to the orchestrator.
- The text inspector still scrolls inside the card at 900px when a video
  layer's trim fields are open; a taller window shows all of it.
