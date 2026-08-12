# The instrument's control island, decided from /proto/island

Date: 2026-08-09. Explored with three icon systems behind a live picker, then a
fourth combining two of them.

## Decided

**An island, not a toolbar.** One dark pill that holds the settings, showing all
of them at once and growing only when a setting needs more room than its own
button. Modelled on ui.camera, measured off its real element rather than its
wrapper: 40px tall, `#151517`, 999px radius, 5px gap, `0 8px 24px / 0.18`
shadow, no dividers at all.

**One rule decides every control's treatment:**

> A preview where the setting has an appearance, a drawn icon where it does not.

- **Backdrop** and **theme** show themselves. Their value *is* a look, so the
  swatch is the gradient and the theme chip is two lines in its own syntax
  colours.
- **Play** cannot be previewed, so it is an icon.
- **Aspect** takes both: a frame drawn at the true proportion *and* the number,
  because at 15px a silhouette alone cannot separate 1:1 from 4:5.

**One rule decides interaction**, reverse-engineered from ui.camera's own
aria-labels: a setting whose value fits on its button and has few options
**cycles in place** (aspect), one that cannot be summarised as text **opens a
panel** (backdrop, theme).

**The CTA lives inside the island** and is the only filled shape in the whole
zone. Every control is transparent until hovered, so the eye lands on the one
thing a visitor came to do.

## Rejected, and why it matters

- **Marks** (no drawings, typographic labels like `AURORA`). Rejected for
  width: the labels change size with the value, so the centred pill breathed on
  every click. Worth revisiting if the island ever moves to a fixed left edge.
- **Instrument alone** (an icon for every control). Rejected as the sole
  direction because previews carry more information than pictograms here, but
  its icon set survives and is what `play`, `aspect` and `back` use. It is the
  direction to extend when the studio needs twenty controls and previews stop
  scaling.
- **Specimen alone** (previews everywhere). Rejected because play has no
  preview and aspect is ambiguous without its number.
- **The previous toolbar**: a filled white disc, a colour gradient, a dark
  square and bare text. Four unrelated treatments for four controls. Measured,
  the theme swatch sat at **1.08:1** against the island — an invisible control —
  and the play button was the only filled shape, giving the strongest weight to
  the least important action.

## Motion, sampled rather than chosen

Every timing came from sampling ui.camera frame by frame:

- **Row entrance does not fade.** First frame at opacity 0.99; the work is a
  scale that overshoots, 0.996 → 1.0068 → 1.
- **Row exit is the dramatic half**: opacity to 0, blur to 4px, scale to 1.20,
  ~156ms.
- **Island width** is a spring with bounce left in it (their 348 → 322.4 → 324
  over ~480ms).

Three defects a Lapse take caught that review would not have:

1. The aspect frame morphs by **scaling a fixed square**, not by animating
   width and height, which forced layout on every frame.
2. The frame spring ran **2666ms** for a single morph, writing sub-pixel values
   for two seconds after the movement was over. Bounded with `restDelta`.
3. The ratio label changed width as it cycled (`1:1` is three characters,
   `16:9` is four), so the centred island grew from both edges and every
   control slid under the cursor. The label now reserves its widest width, and
   the cycle costs no layout at all.

## Shape, and why the selection stopped being a ring

**Controls are 10px rounded rects, not pills.** The radius is concentric with
the previews they hold: a 4px swatch with 6px of button around it gives
4 + 6 = 10. The pill is left to the CTA, which makes it the only pill as well as
the only filled shape.

**Selection is a plate inside the control, not a ring around it.** A 40px island
holding 30px controls leaves 5px above and below, and the ring spent 5.5 of it —
39px of indicator in a 40px track, drawn as a circle around a rectangular
swatch. The plate takes the control's own shape, cannot collide with anything,
and still glides between swatches on the same `layoutId`. The focus ring lives
in the remaining budget: 2px of stroke at 1px offset, 2.06px of clearance top
and bottom.

Related: the helper pill is centred by Motion, not by CSS. Motion writes
`transform` to animate y and scale, so a stylesheet `translateX(-50%)` on the
same element is overwritten the moment the entrance runs.

## The stage, and the lane the helper borrows

**The ratio no longer resizes the page.** Each aspect used to carry its own
size — 636×358 at 16:9, up to 252×448 at 9:16 — so cycling grew the frame and
pushed the dock, the caption and everything below it down by up to 90px. A Lapse
take named the mechanism outright: `div in 'Live preview…' animates height
(layout)`. The frame is now fitted into a stage whose height the ratio cannot
change, and the drift measures 0px across all three.

**The stage's height is the hero's shock absorber.** Everything else in the
first viewport costs a fixed ~460px, so the stage takes what is left,
`clamp(232px, 100svh - 460px, 400px)`, and the frame scales to whatever it gets.
On a 700px-tall window the hero fits where it used to run 199px past the fold.

**The helper opens upward, into a strip carved out of the stage.** Above the
island is where it belongs, and it is also where it used to cover the preview it
was describing. The fix is not to move the helper but to give it somewhere to
go: the stage keeps a 34px strip at its bottom that the frame never enters, so
the pill opens into empty page at every ratio. Taking the strip out of the stage
rather than adding it under the dock is what makes it free — the hero pays
nothing for it. Measured at all three ratios: 16px to 20px between the frame and
the pill, 10px between the pill and the island, 0px off centre.

## The target is the pitch, not a number we liked

**A hit area may grow into the gap beside it and no further.** The controls
carried a flat 44px target behind a 30px visual, and the row's pitch is 35px: a
30px control and a 5px gap. So each target overhung its neighbour by 9px, and
because a later sibling paints over an earlier one, every target ended up 4.5px
to the left of the control it belonged to. Sampled with `elementFromPoint`
across the theme row at 375, the aurora chip drew 117.5→147.5 and won
110→144.5: its own right edge opened dracula.

Half the gap on each side is the widest extent that still tiles, so that is what
they take, plus the island's 6px of padding at the two ends. The area is the
same 35px it always effectively was; it is centred on the control now. This is
the rule `.hit-ext` already writes down for the studio's compact controls, and
the island is the density it warns about: at this spacing the control's own size
is the target, and 30px clears WCAG 2.5.8's 24px floor without help. Vertically
there was never 44px to have: the island is 40px tall and clips its own
overflow, so it was cut to 40 before it reached a finger.

**The island measures `offsetWidth`.** A hit area that reaches past the row is
content as far as `scrollWidth` is concerned, so the pill grew by however far
the last control's target stuck out and left that much dead pill beyond it: 13px
of right padding against 6px on the left. The row holds its width with
`flex: none` rather than shrinking on every frame of the width spring, which is
what the island's `overflow: hidden` was written for in the first place.

## Focus goes both ways

**Each direction hands focus to the control that undoes the move.** Closing a
panel already returned focus to the button that opened it. Opening one did not:
the press replaces the whole row, so the button that was pressed stopped
existing and focus fell to the body, and Tab resumed from the top of the
document with the options the press had just asked for sitting behind every
other control on the page. Opening now lands on Back, closing still lands on the
opener, and both ride the incoming row's mount, since `mode="wait"` holds it
until the outgoing row has finished leaving and the moment of the press is too
early to focus anything.

No `aria-expanded`. The trigger that would report it is the one that stops
existing, so it could only ever be stale; the row announces itself as a toolbar
and each opener says what it opens.

## Open

The island holds four controls where ui.camera holds eight, so it reads
sparser than its model. Closing that gap is a product decision — exposing morph
tempo, grain, window chrome or line numbers — not a styling one.
