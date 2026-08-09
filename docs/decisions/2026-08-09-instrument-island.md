# The instrument's control island, decided from /proto/island

Date: 2026-08-09. Explored with three icon systems behind a live picker, then a
fourth combining two of them.

## Decided

**An island, not a toolbar.** One dark pill that holds the settings, showing all
of them at once and growing only when a setting needs more room than its own
button. Modelled on an external reference, measured off its real element rather than its
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

**One rule decides interaction**, reverse-engineered from an external reference's own
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

Every timing came from sampling an external reference frame by frame:

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

## Open

The island holds four controls where an external reference holds eight, so it reads
sparser than its model. Closing that gap is a product decision — exposing morph
tempo, grain, window chrome or line numbers — not a styling one.
