# Pass: landing, 2026-10-08 (the pipeline)

## Screen

Route `/`, phone and desktop, light and dark: the build of the Pipeline direction
Bruno chose (decision `docs/decisions/2026-10-08-landing-pipeline.md`). Out of
scope: the footer's legal and repository links (owner item #217), prices (#79), the
studio.

## Before

The landing after the design audit (`2026-10-08-landing-audit.md`): a hero with no
headline, four feature blocks (the social phone on the dark band), the export fan,
the sharpness proof, the capability ledger, the close.

## Decisions

- **The page is the pipeline** (D1): headline "A pull request in. A video out.", the
  lead naming the steps, the field, log and meta unchanged, the live Instrument beside
  them from 960px (D3); a strip of the five steps, each a link to its stage; five stages
  on one opaque rail (`--edge`), each a figure beside the product.
- **Reused, not rebuilt**: the import shot (Paste), the live morph (Morph), the phone and
  its chips (Check, now on the paper: unselected chips ash, the selected one ink on the
  surface with the primary as its dot, since the primary is 1.67:1 as text), the export
  shapes as four 320px-tall webp captures (Export), a frame of a real export (Hosted).
  `frame-fan`, `capability-ledger` and `feature-section` are gone.
- **Figures** (D2): the hairline kernel copied verbatim under its MIT notice
  (`src/presentation/landing/figures/kernel.js`, `public/licenses/hairline-MIT.txt`), the
  five figures ported to TypeScript and validated by the skill's validator after a
  round-trip to its format. `HairlineFigure` imports a figure and the kernel only when
  its stage is within 600px of the viewport, reserves the 5:4 box in CSS, labels the
  stage as an image, writes the read-out into the caption and destroys on unmount. The
  palette is `--hairline-*`: ink and paper, and ink mixed into paper for the edge, middle
  and dim strokes, a little more ink on the dark theme. One system across the five: one
  camera (45°, 0.5), a scale family that keeps every rest pose 295 to 306 of 400 wide,
  one stagger (32ms), a lap each through three different answers, the stroke change on
  the page's 150ms ease-out; all five pass the skill's look check.
- **Nav** (D5 kept): the island plate from the first screen, with How it works, Proof and
  Pricing from 640px; its CTA is a text action while the hero (and its filled button) is
  in view, the primary past it (D2).
- **Proof on the band**: the sharpness section is the page's one dark band, with the
  specification under it (Import, Look, Motion, Check, On device, Hosted, Licence; the
  licence row because the repository is AGPL-3.0, decision 2026-10-04 D1). The band
  takes its own hairline.
- **Pricing**: two columns of one card, no prices, no button (the close is the zone's
  filled action).
- **Phone**: under 640px the pair under a stage takes back the rail's indent, so the
  import shot keeps its corner and the five chips one row at 360; the strip scrolls on
  its own, edge to edge.

## After

`.craft/evidence/2026-10-08-landing-pipeline/` (git-ignored): every section at 360, 390
and 1440 in both themes, the reduced-motion and nav probes, the contrast, LCP and size
measurements. No horizontal scroll at 360, 390 or 1440; every text run 5.05:1 or more
(light) and 5.57:1 or more (dark).

## Open

- The figures answer a pointer or a finger only; a keyboard reader gets the label and
  the lap (each figure walks three answers once, the first time it is 60% in view, D8).
- Needs a device: the figures' sideways drag against the page's vertical scroll on iOS.
