# Hero direction, decided from /proto/hero

Date: 2026-08-09. Explored with three live variants behind a picker, then a
second round comparing themes on the winner.

## Decided

**Direction: Terminal.** The mono carries the page, left aligned, no centred
display type.

- Headline set in Ioskeley Mono, `clamp(2rem, 4.2vw, 3.25rem)`, weight 600,
  line-height 1.12, tracking -0.02em.
- Headline copy shortened to one line: "Your pull request, as a video".
- Typefaces cut from four to two: **Geist** (sans) and **Ioskeley Mono** (mono),
  replacing Inter, JetBrains Mono, Newsreader and Bricolage Grotesque.
- Both themes ship. Light stays the project's warm paper `#faf9f6`; dark is
  `#121110`, warm rather than a neutral slate.
- Colour is semantic only: syntax and diff state. The chassis stays neutral.
- The product shot morphs instead of sitting still.

## Why Terminal over the other two

Editorial and Split were both good and both interchangeable with any number of
SaaS landing pages; their layout said nothing about the product. Terminal sets
the headline in the product's own material, so a developer arriving from a link
understands the subject before reading a word of copy. A landing is seen once,
briefly: memorable beats comfortable.

## Rejected, and why it matters

- **Editorial** (large centred sans, code as specimen). Rejected for being
  generic, not for being weak: it handled the long headline better than Terminal
  and it is the direction to return to if the copy ever grows.
- **Split** (argument left, artefact right, everything above the fold). The best
  for conversion and the least distinctive. It also collapses to one column
  below 760px, where the artefact loses its role.
- **Neutral cold palette** (chroma 0, near-black, copied from diffshub).
  Rejected: the project's warmth is what separates it from every grey developer
  tool, and the landing is light by default.
- **A still snippet in the hero.** Rejected: a product that sells motion should
  not advertise itself with a frozen frame.

## Open, deliberately

The morph currently loops forever. That kept the page from ever settling, which
is a real cost (CPU, and it prevented screenshot tooling from stabilising).
Playing once on entrance and replaying on hover is the likely answer, not
decided yet.

Ioskeley Mono ships at roughly 480 KB per weight, which is Iosevka's glyph
coverage rather than a packaging mistake. Two weights are loaded, so the hero
currently costs about 940 KB of font. Subsetting to latin should bring that
down to tens of KB; it must happen before this goes in front of real traffic,
and it is not done here.
