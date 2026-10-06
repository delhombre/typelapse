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

## Open

- Selected segments in the rail still wash in `rgb(255 213 11)` while the CTA
  now wears `--color-primary` (U2 is settling Drift 1 in `studio-camera.css`).
- The island's width spring (205/22, damping ratio 0.77) overshoots by a few
  pixels into its own clip; the landing's 260/26 settles. U2, D8.
- A diff paste that is not a diff is asked about ("Replace what you have with
  this code?") before it is known to be readable, as the file was. Reading it
  first means parsing in the menu; left for the import owner.
- `ConfirmDiscard` (`components/ui/confirm-discard.tsx`) still carries the
  glow shadow on its confirm and, as a standalone modal, the browser's focus
  ring around the whole dialog. Not in this pass's files.
- The phone status keeps the 36px plate and 660px width (U4).
