# Pass: landing, 2026-10-08 (design audit)

## Screen

Route `/`, desktop and phone, light and dark. Every file under
`src/presentation/landing/` and the `.lp-*` blocks of `src/app.css`. Out of
scope: the footer links (owner item #217), the video's own rendering (the code
window's chrome and title, D12), the studio, auth and server.

## Before

Audit: `.craft/evidence/2026-10-08-design-audit/landing/audit.json` (measured)
and its 202 screenshots; the same harness replayed on main is in
`.craft/evidence/2026-10-08-landing-fix/before/`.

- Nav pill over the dark band, dark theme: brand `#f5f3ef` on pill `#faf9f6`,
  1.05:1; the capsule the same. `dynamic-nav.tsx` flipped the plate with `useOverDark`.
- Theme toggle over the band, dark theme: `text-paper/75`, and paper is `#121110`
  there, 1.07:1 (`theme-toggle.tsx`).
- Dark mode had no edges: the pill, `.lp-island`, `.lp-morph-frame`, the frame
  halo (`OBJECT_SHADOW`) and `.lp-import-shot` were black shadows on near-black.
- Literals: two yellows (`#f5c400`, `#f1be01`), `#1f2229` under code that is tuned
  on one-dark's `#282c34`, `#ff5f57` three times, `#1c1b19` and `#fff` in the import mock.
- Type: eyebrow 11px, mock text 7 to 10px, badge 9px, placeholder at 75% ash (3.18:1).
- Social chips unselected: `text-white/40`, 3.82:1.
- Hero button 95px empty, 142px with text: it stepped under the first keystroke and the
  field lost 47px. A pasted diff on a phone scrolled sideways through 13 characters.

## Decisions

- **The nav pill is the island's plate** (`emil-surfaces`, D5): `.lp-nav-pill` reads
  `--dock-bg`, `--dock-ink`, `--island-lift` and `--island-edge`; no `useOverDark`;
  the CTA is `--color-cta` everywhere (D2); `top-[max(12px,env(safe-area-inset-top))]` (D14).
  D5 amended in one sentence. New tokens `--island-lift`, `--island-edge`.
- **The toggle reads `--color-band-ink`** (`emil-color`), a new `@theme` token that
  `.lp-dark` maps `--color-ink` to, so the band's ink has one definition.
- **Dark edges are rings in the stack, never lighter fills** (`emil-surfaces` rule 3):
  `--island-edge` on the island, helper and pill; `--object-lift` swaps the frame's
  halo for a ring on dark; `--raised-ring` replaces the import shot's border;
  the morph frame gets a ring on dark. New tokens `--object-lift`, `--raised-ring`.
- **Literals to roles** (`emil-color`): `--color-primary` for both yellows; the morph frame
  takes the Theme's own background inline; the lights come from `CHROME_STYLE.macos.lights`
  (read-only, D12); the import preview re-scopes `--color-paper/ink/ash` to the light
  palette (a picture of the studio keeps it); the toast is `--dock-bg`.
- **Type floors** (`emil-typography`): eyebrow 12px; nothing in a landing rule under 11px
  (test-enforced); mock thumbnails draw code as bars, since 4.7px code reads as nothing;
  leading as ratios (`calc(26 / 17)`, `2`, `calc(20 / 13)`); placeholder at full ash.
- **D8 labels** (`emil-ui-polish`): `.lp-swap` lays both labels in one grid cell, the other
  hidden and `aria-hidden`; used by the field's button and by Play motion / Replay.
  At 380px and below the button takes 12px type and 10px padding so the placeholders
  (144px, and 154px in diff mode) fit; `landing-hero.spec.ts` measures it at 360.
- **Phone diff** (`emil-mobile-native`): at 520px and below, a multiline field wraps its
  text and sends the button to a row under it.
- **No glass on text** (design-direction): the mock's chip and toast are opaque.
- **Chips**: unselected `text-band-ink/65` (7.3:1 on the band); the order is the sentence's
  (the cycle's, so TikTok opens the phone); `--chip-pad` and `--chip-step` close up at
  420px and 374px so five chips fit one row at 360; the active dot's glow and the radial
  behind the phone are gone (`emil-unslop-design`).
- **Mode pills**: the selected one has a 2px ink rule on its top edge.
- **Fan**: cards stop lifting on hover; they open nothing. The hover machinery is deleted.
- **Copy**: final CTA "Open studio"; "the lossless reference frame"; the ledger's `dt` is
  13px ink, its `dd` ash. Dark theme halves `--color-primary-glow`.
- **Diff mock radii** (D3): scenes `calc(var(--shot-r) - var(--shot-pad))`, thumbs minus 5px.

## After

Replayed with the same harness against this branch:
`.craft/evidence/2026-10-08-landing-fix/after/`, side by side with the first viewport,
nav, toggle, field, chips and mock in `.craft/evidence/2026-10-08-landing-fix/compare/`.
`bash .craft/verify.sh`: OK. New tests: `tests/presentation/landing-nav-plate.test.tsx`,
`landing-design-floors.test.ts`, the hero label test, the sharpness wording.

## Review verdict

Self-review with `emil-ui-review` and `emil-unslop-design`: approve with changes, all made
(the fan's hover lift removed as an unclickable object reacting; the glow and halo deleted;
no remaining blocking item). Needs a device: the nav under a real notch, the 360px
chip row and the phone diff field on iOS Safari.

## Open

- 320px phones: the five chips wrap to two rows and the placeholder is clipped; not
  in the audit's matrix, left.
- Static frames keep their pictorial shadows (`CARD_SHADOW` is D5's), the badge scrim and
  the sharpness crop's `#0d1117` (the crop's own backdrop, from the measured file).
- Footer links: owner item #217.
