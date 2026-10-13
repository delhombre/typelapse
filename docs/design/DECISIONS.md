# Design decisions

The standing doctrine behind `SYSTEM.md`. Reopening an entry needs new
evidence (a measurement, a Lapse take, a review verdict). A pass amends one
only through its file in `docs/design/passes/`; the owner overturns one with
its Pivot. History and rejected options stay in `docs/decisions/`.

## D1 The frame on the paper, controls in the island

**Decision:** The video is the one object on the page, centred on plain
paper. Every setting lives in the dark island anchored under it, in normal
flow, never fixed. The code card, the corner chips and the timeline float on
the same paper; nothing else is full width. A cluster raises a sheet above
the island instead of opening a side panel.

**Why:** ui.camera and the shell Bruno chose ("C, La scène", 2026-08-12):
the picture is what the visitor came for. In flow, the island never reaches
the header; on a short window the frame gives way first.

**Enforced by:** `src/presentation/components/layout/scene-shell.tsx`,
`src/application/layout/scene-stage.ts` (tested in
`tests/application/scene-stage.test.ts`), the `.sc-*` blocks in `src/app.css`.

**Pivot:** "Give the controls a permanent side panel."

## D2 One filled shape per zone, and it wears the primary

**Decision:** In a zone (the island, a sheet, a popover, a dialog footer)
exactly one shape is filled: the CTA, `--color-primary` with
`--color-on-primary` text. Every other control is transparent until hovered.
When a sheet opens with its own render button, the island's CTA hands its fill
over (`.si-cta[data-open]`). On the landing "Open studio" is said once in
the first screen: the hero field's button, filled with the primary in both
themes; the Instrument's island carries no CTA, and the nav pill keeps its
own in place but faded and inert until the hero has scrolled out.

**Why:** hierarchy by subtraction; the old toolbar gave its only filled disc
to Play, the least important action. Ink on the yellow reads 9.92:1, white
1.73:1.

**Enforced by:** `src/app.css` (`--color-primary`, `--color-cta`, `.si-cta`,
`.lp-field-cta`, `.lp-nav-cta-link`), `tests/presentation/landing-hero.test.tsx`,
`tests/presentation/landing-nav-plate.test.tsx` (pass
`docs/design/passes/2026-10-05-landing.md`).

**Pivot:** "Secondary actions may be filled too."

## D3 One radius family, nested concentric, round inside round

**Decision:** In a parent's corner: the parent's radius minus the gap,
floored at zero, kept as a `calc()`. Elsewhere: the step for its height
(10px control, 8px field). Inside a fully round parent concentric means
round (`--r-pill`, wash and plate `inherit`), except a control holding a
preview, which keeps 10px. A plate taller than it is round never takes 999px.
The code card tracks its window, `outer = inner + gap`, square stays square.

**Why:** a 10px plate at the end of a 999px pill reads as a rectangle
rattling in a capsule; a button at 10px in the island and 9px in a chip
reads as two products; a pill radius on a tall plate bows its sides.

**Enforced by:** `src/app.css` (the `--r-*` block),
`src/application/layout/concentric.ts` (tested in
`tests/application/concentric.test.ts`); the source hub, the showcase, the
drop veil, the capture library and the account island are read for it by
`tests/presentation/studio-surfaces-system.test.ts`.

**Pivot:** "Use one radius everywhere."

## D4 Hover moves the fill one step, never the ink

**Decision:** Hover styles live only inside
`@media (hover: hover) and (pointer: fine)`. A hover moves the background
one step (a 7% white wash on the island) and never the text colour of a
selected or plated control; on a filled plate the one step left is white.
What only a hover reveals (the island helper) is hidden under
`(hover: none)` and carried by the aria-label.

**Why:** a four-class `:hover` beat a three-class `[data-selected]` and
painted near-white text on every white plate in the product. On touch a
hover never shows or sticks after the tap.

**Enforced by:** `src/app.css` (`.si-button[data-selected]:hover` and its
comment, `.lp-island-helper`), `src/presentation/studio-camera.css` (every
hover behind the same query).

**Pivot:** "Hover may change the label colour."

## D5 Materials: a fixed dark plate, a paper card, depth from shadow

**Decision:** Three materials. The island and its sheet are a dark plate (`#151517`)
that does not follow the theme; on a dark page it keeps its fill and gains an inset
hairline. The landing's nav pill is that plate, never inverted; its CTA stays
primary (D2). Floating surfaces over the phone's stage are the landing's card
material: paper at 88%, a blur, a 1px ring, one soft shadow, and so are the header
capsules; a menu or popover that holds rows of text takes the opaque studio surface
instead, in both shells (next-wave D6): the phone's More menu, the account panel and
the phone's sheet at every stop included; a header trigger sits on flat paper and
takes the fill without the blur. The desktop card and timeline sit on flat paper, so
they are opaque. Code frames take a layered shadow with a 1px ring inside it, not a
border. Reduced transparency removes every blur and makes the material opaque.

**Why:** the same plate on `/` and `/app` says it is the same instrument; an
island that inverted with the theme would read as a panel of the page. A
drop shadow does nothing on a dark page, so the edge comes from a line. A
blur over flat paper shows nothing and costs a layer over the editor.

**Enforced by:** `src/app.css` (`.si-island`, `.lp-island`, `.lp-nav-pill`, `.sc-chip`, the
reduced-transparency query), `src/presentation/studio-camera.css`
(`--camera-surface`, `--camera-material`), `src/presentation/landing/static-frame.tsx`
(`CARD_SHADOW`).

**Pivot:** "Add a fourth material (glass panels, coloured cards)."

## D6 Warm, in both themes, across both pages

**Decision:** Paper `#faf9f6` light and `#121110` dark, ink `#1c1b19`, never
a neutral slate. The studio remaps Tailwind's neutral ramp to warm stone
whose ends land on the landing's paper and ink. Both themes ship; the
browser chrome and the document match the theme before the bundle runs. The
landing's document chrome (`data-landing-theme`, `theme-color`) belongs to its
route, so its error fallback keeps it.

**Why:** the warmth is the brand (hero direction, 2026-08-09); the cold ramp
dropped the temperature between `/` and `/app`.

**Enforced by:** `src/app.css` (the warmth block, `html[data-landing-theme]`),
`index.html` (theme-color, the inline theme script),
`tests/presentation/landing-theme-color.test.tsx`,
`tests/presentation/landing-error-boundary.test.tsx`,
`tests/presentation/studio-theme-mode.test.ts`, `src/presentation/studio-camera.css`
(the desktop paper reads the same ramp).

**Pivot:** "Go neutral grey."

## D7 The landing and the studio: what differs, what is shared

**Decision:** The landing scrolls, keeps the native scrollbar, sets its
headline in the mono, reveals sections once, themes by `data-theme`. The
studio is a fixed shell, thins scrollbars only in its work surfaces, reveals
nothing, themes by `.dark` on `<html>`. Shared, never forked: the primary and
one-fill rule, the focus ring, `--ease-out`, the island, the hairline, 44/16.

**Why:** a page seen once may be memorable; a tool used for an hour must be
quiet. The shared set says the object on `/` is the object on `/app`.

**Enforced by:** `src/app.css` (`.landing-root`, `.studio-root`),
`src/presentation/landing/tokens.ts`, `src/presentation/landing/use-landing-theme.ts`,
`src/presentation/stores/theme-mode.store.ts`.

**Pivot:** "Make the studio as expressive as the landing."

## D8 What is never animated

**Decision:** No layout property (width, height, top, left, padding): the
fold and the step back are transforms on `.sc-stage` and `.sc-dock`; an
aspect change is a `clip-path` on one box sized for every ratio. One sanctioned exception: the island's
own `width` springs to its measured row, because the row holds its size
(`flex: none`) and the island clips it, on a critically damped spring so it
never closes on the row's last control. A drag or a keyboard move is
one-to-one and instant; only a finished reorder settles. A cycling label
reserves its widest width. Nothing enters from `scale(0)`. Under reduced
motion only colour, opacity and shadow transitions survive, and the global
allow-list is the whole rule: no stylesheet turns a transition off locally. No looping ambient motion: a landing figure plays its lap once, the first time it is 60% in view, then only answers a hand; never under reduced motion, never on re-entry (PO, 2026-10-08). One placement exception (#270): when the phone studio opens, its sheet and instrument are placed at their stop on the first frame (`.sc-sheet[data-opening]`), not slid to it; it ends when the studio is drawn.

**Why:** a Lapse take caught the aspect frame forcing layout every frame and
a spring writing sub-pixel values for 2666ms; a label one character wider
slid every control under the cursor. A movement nobody named does not happen.

**Enforced by:** `src/app.css` (the scene comment, the reduced-motion query),
`src/presentation/components/timeline/timeline-motion.ts`,
`src/presentation/landing/instrument.tsx`,
`src/presentation/components/controls/island-motion.ts`, the export progress
fill, which scales (`scaleX`, `tests/presentation/export-status-progress.test.tsx`), and
`tests/presentation/studio-surfaces-system.test.ts` for the allow-list.

**Pivot:** "Animate the layout directly; the jank is acceptable."

## D9 Focus is blue, and only for the keyboard

**Decision:** `2px solid var(--color-accent)` at 2px offset, on
`:focus-visible` only; 3px under `prefers-contrast: more`. In the island,
2px at 1px offset in the island's ink, to fit its 5px of clearance. A
container that receives programmatic focus (the phone sheet, the gallery
dialog, the replace question's modal) draws no ring; its controls do.

**Why:** a ring needs 3:1 against what it sits on, and the primary yellow
measures 1.67:1 against paper: the one place the brand colour cannot go.

**Enforced by:** `src/app.css` (`:focus-visible`, the Vaul and gallery
exceptions), `src/presentation/studio-camera.css` (`--camera-focus`).

**Pivot:** "Use the brand yellow for focus."

## D10 Touch: a 44px target, a 16px field

**Decision:** Every control has a 44px hit area without growing its drawn
size (`.hit-target`, `.hit-ext`), and grows into the gap beside it no
further. Under `pointer: coarse` every text field types at 16px. No tap
highlight, `touch-action: manipulation`, no selection on a long-pressed
button. On the phone's corner row that reach is the chip's padding plus
half the gap to the next chip (`--edge-bleed`).

**Why:** iOS zooms into a field under 16px and stays zoomed. A 44px square
in a 35px pitch overhung its neighbour by 9px and stole its presses.

**Enforced by:** `src/app.css`, `src/presentation/studio-camera.css`,
`tests/e2e/mobile-shell.spec.ts` (every Export control reachable at 375x667),
`tests/presentation/layer-editor-in-sheet.test.ts`,
`tests/application/phone-sheet.test.ts`.

On the island's sheet and status row the 44px is drawn, not extended: rows are
7 to 12px apart, so a reach past a 44px box would be shared with the row beside
it (`src/app.css`, the coarse block above the export status). The phone's social
row joins the 44px cells with no gap.

**Pivot:** "Desktop only; drop the touch rules."

## D11 Two typefaces, never synthesized

**Decision:** Geist for every sans role, Ioskeley Mono for every mono role,
self-hosted, first-paint files preloaded, with a metric-matched Arial
fallback; only loaded weights (`font-synthesis: none`). The code in a video
may use any registry code font: that is the user's content, not the UI.

**Why:** the hero direction cut four families to two. A synthesized bold
smears; a fallback with other metrics shifts the layout when the file lands.

**Enforced by:** `index.html`, `src/application/fonts/code-fonts.ts`,
`tests/presentation/self-hosted-fonts.test.ts`, `tests/application/code-fonts.test.ts`.

**Pivot:** "Add a display face for the landing."

## D12 Preview equals export

**Decision:** What is drawn inside the video frame (card radius, chrome bar,
shadow, line height) is read from one table in `src/application` by the DOM
preview, the Remotion composition and the canvas painter. A visual change
lands in all three or does not land. On a phone the code is read through a
loupe: a tap scales that same DOM preview to an 11px code floor inside a clip-path, never a fourth picture.

**Why:** the canvas painter is a third renderer; four drifts in one PR came
from literals copied between renderers. At 374px a 1080p frame draws its code at 2 to 6px.

**Enforced by:** `src/application/layout/frame-metrics.ts`,
`tests/application/frame-metrics.test.ts`,
`tests/application/canonical-card-width.test.tsx`, `src/application/layout/code-loupe.ts`, `tests/e2e/mobile-shell.spec.ts` (the loupe).

**Pivot:** "The export may differ from the preview."

## D13 Copy: one plain sentence, no em-dashes

**Decision:** A status, an error, an empty state or a refusal is one plain
sentence: what happened, what to do. No exclamation mark, no "seamlessly",
no superlative the repository cannot measure; a landing claim is the
measured form ("43.63 dB"). No em-dash or en-dash in copy, meta tags, docs,
comments or commits: a comma, a colon, a period or parentheses (CSS
box-drawing rules and the windowing ellipsis are not dashes).

**Why:** ui.camera's calm; a public claim must survive a check; the dash is
the plainest tell of generated prose, banned codebase-wide by the owner.

**Enforced by:** `tests/docs/launch-kit.test.ts` (dashes, superlatives,
"seamless"), `tests/presentation/landing-meta.test.ts`,
`tests/application/transparency.test.ts`, `tests/docs/design-system.test.ts`.

**Pivot:** "Copy may be playful, and docs may use dashes."

## D14 The phone chrome clears the safe areas

**Decision:** Every piece of phone chrome starts from its inset: the corner
row from `max(10px, env(safe-area-inset-top))`, the stage slot and the menus
from the same line, the sheet's stops from `phone-sheet.ts`, the drop veil
inset on every side, the strip an import link raises, a sheet's gutters and
bottom padding, the instrument above the bottom inset. The insets reach
JavaScript through a probe padded with `env()`, which follows a rotation.

**Why:** `viewport-fit=cover` paints under the notch and the home indicator;
a chip under the notch cannot be pressed, and a sheet handle on the home
indicator becomes the home gesture.

**Enforced by:** `src/application/layout/phone-sheet.ts`,
`tests/application/phone-sheet.test.ts`, `src/presentation/hooks/use-phone-viewport.ts`,
`src/app.css` (pass `docs/design/passes/2026-10-05-studio-phone.md`).

**Pivot:** "Stop painting under the notch (drop `viewport-fit=cover`)."

## D15 A full-window root clips, it never scrolls

**Decision:** A root sized to the window that hides an overhang uses
`overflow: clip`, never `overflow: hidden`.

**Why:** a hidden box is still a scroll container: with the card open the
stage overhung the window by up to 160px, and one focus or scrollIntoView
slid the whole studio 155px left under its own header. A clipped box cannot
be scrolled at all.

**Enforced by:** `src/presentation/studio-camera.css` (the desktop root),
`src/app.css` (`.sc-root`, the phone's), `tests/e2e/studio-shell.spec.ts`,
`tests/e2e/mobile-shell.spec.ts`, `tests/presentation/studio-surfaces-system.test.ts`
(passes `docs/design/passes/2026-10-05-studio-desktop.md` and
`docs/design/passes/2026-10-05-studio-drift.md`).

**Pivot:** "Let the studio scroll to reveal an overhang."

## D16 Disabled is a colour, a reason and a cue, never an opacity

**Decision:** A disabled control takes `--camera-disabled` (the island and its
status restate it as `--dock-disabled`, for the dark plate). 4.5:1 is the
readability floor; the reason and the cue carry the state, since the disabled
ink sits within a step of the muted one: a disabled primary action says why in
words beside it (Render with no scene: a note and a Capture shortcut, on the
phone's sheet and above the desktop rail), and a muted-ink control that can be
disabled gets a cue that is not colour (a dashed hairline, the not-allowed
cursor, a struck-through name on a muted layer). A busy control is not a
disabled one: Render keeps its fill and says "Rendering…", with `aria-busy`.

**Why:** opacity as state failed contrast (Render at .55, 2.1:1) and a `title` never shows on a phone.

**Enforced by:** `src/presentation/studio-camera.css`, `src/app.css`, `src/application/export/render-block.ts`, `tests/presentation/export-panel-playable.test.tsx`.

**Pivot:** "Dim it to 40%."
