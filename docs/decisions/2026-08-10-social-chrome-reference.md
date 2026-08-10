# Social-feed chrome, measured from the live 2026 apps

Date: 2026-08-10. The in-feed chromes in
`src/presentation/components/preview/social-chrome/` were drawn from memory, and
iOS 26 (Liquid Glass) plus a year of app updates moved them out of date. This is
the measured reference to correct them against, so the correction is grounded
rather than redrawn from memory a second time.

## How it was captured

TikTok and Instagram Reels, both reached at an iPhone viewport (393×852pt) with
**no account and no captcha**, by walking around the login walls:

- **TikTok**: `/foryou` is walled, but a direct video URL
  (`tiktok.com/@user/video/<id>`) serves the full immersive mobile chrome. Live
  DOM geometry read off it.
- **Instagram**: `instagram.com/reels/` renders the full Reels chrome with no
  login. Live DOM geometry read off it.

Each was cross-validated against the current App Store marketing renders
(**TikTok v46.3.0** and **Instagram v441.0.0**, both released 2026-08-03). The
numbers below are trusted because the two independent sources agree: the rail
axis came out at 360pt (TikTok) and 365pt (Instagram) from both the DOM and a
pixel measurement of the App Store shots. All `%` are of viewport width (393pt).

## TikTok

**Right rail** — axis at 360pt (91.6% vw), icons right-aligned ~16pt from the edge:

| # | Element | Style | Size | Count |
|---|---|---|---|---|
| 1 | Avatar | circle, 2pt white ring | 45pt | — |
| 1b | Follow badge | filled red circle, white `+`, overlaps avatar bottom | 21pt | — |
| 2 | Heart | **filled** white | 33×30pt | `991K` |
| 3 | Comment | **filled** white bubble, 3 dark dots, tail bottom-left | 32×29pt | `3456` |
| 4 | Bookmark | **filled** white ribbon, bottom notch (tall/narrow) | 22×26pt | `1256` |
| 5 | Share | **filled** white curved arrow, points right | 32×24pt | `2281` |
| 6 | Music disc | black circle, album art inset + white ring, 2 note glyphs to its left | 39pt | — |

Counts centred under each icon, ~13pt, weight 600, pure white. Native
centre-to-centre pitch ≈ 68pt.

**Bottom-left** (13pt margin): `@handle` bold ~17pt (handle only, no follow
button here, no display name) → sound row: note glyph + `original sound - handle`
~15pt, slightly dimmed.

**Top bar** (the biggest gap vs the current component):
- Left: a **LIVE entry point** — rounded-square TV outline with `LIVE` inside.
- Centre: `Following` (dimmed, with a **red unread dot**) · a thin vertical
  divider `|` · `For You` (bright, bold). **No underline under the active tab** —
  weight and opacity carry the state, the divider is the only separator.
- Right: search magnifier, outline.

**Bottom nav** (absent from the component today): solid `#000`, ~44pt, 5 slots at
78.6pt pitch — Home (filled, active) · **Friends** · create · Inbox · Profile,
each with a ~10pt label. Create button = white rounded rect (44×23pt, r≈8) with a
**cyan-left / red-right sliver** and a black `+`.

**Colours** (DOM-authoritative): red `#FE2C55`, cyan `#25F4EE`, nav `#000`, rail
glyphs pure white.

**Scrims**: top is a **flat `rgba(0,0,0,0.6)` band, 56pt tall** (not a ramp); the
body carries `linear-gradient(transparent → rgba(0,0,0,0.5))` over its full
height.

## Instagram Reels

**Right rail** — axis at 365pt (92.9% vw), 16pt right margin. Every icon
**outline**, uniform stroke, pure white:

| # | Element | Style | Count |
|---|---|---|---|
| 1 | Heart | outline, ~2.5pt stroke, 24–25pt | `1M` (web; absent in native render) |
| 2 | Comment | outline bubble, tail bottom-right, 24–25pt | `15.8K` (web) |
| 3 | **Repost** | outline, two curved arrows forming a loop | — |
| 4 | Share | outline paper plane (downward triangle, inner fold), 24pt | — |
| 5 | More | **horizontal** `...`, 24pt wide | — |

No bookmark in the rail (saving lives behind `...`). Native gap ≈ 17pt; web 20pt,
then 28pt before the `...`.

**Bottom-left** (~16pt margin): row of avatar (~30pt, story ring) + `handle` bold
~15pt + verified badge + **`Follow` pill** — transparent fill, ~1pt white/60%
border, 60×21pt, r≈6 (a rounded rect, not a full pill). Then caption. Then a
**social-proof row**: 3 overlapping ~14pt mini-avatars + `Liked by x and N others`,
slightly dimmed. **No audio ticker row.**

**Top bar** (a full version ahead of the component):
- Left: a thin `+` (~28pt).
- Centre: dual tabs `Reels` and `Friends`, ~18pt bold, inactive ~55% white, with
  a **cluster of 3 overlapping avatars** just right of `Friends`.
- Right: a **sliders/tune** icon (not a camera).

**Bottom nav** (44pt, `#000`, 5 slots @ 78.6pt): Home (outline) · **Reels active
as a filled white rounded square with a black play triangle** · DM · Search ·
Profile. (The web build reorders slots 2–3; native is authoritative.)

**Scrims** (exact, from the DOM): one gradient over the whole video —
`linear-gradient(0deg, rgba(0,0,0,0.35), transparent 30%, transparent 80%,
rgba(0,0,0,0.35))`. Bottom = bottom 30% ramping to 0.35; top = top 20% ramping to
0.35.

## What changed since the component was drawn (the point of the exercise)

- **TikTok**: LIVE icon top-left; red dot on `Following`; a divider between tabs
  and **no underline** (the component draws an underline pill); `Friends` as the
  2nd nav slot; the cyan/red create button.
- **Instagram**: `Reels | Friends` dual tabs + 3-avatar cluster replacing the old
  wordmark; a **Repost** rail icon the component lacks entirely; `...` is
  **horizontal**, not vertical; a `Liked by …` row where the component draws an
  audio ticker; the active Reels nav tab as a filled white square.

## Not verified

- The genuine FYP *inside* the native TikTok app (the public video page uses the
  same chrome, but may not be pixel-identical).
- Native scrim opacities/heights (section values are from the web DOM; the App
  Store shots are too busy to measure a gradient against).
- Whether Instagram still shows an audio thumbnail / rail counts — state
  dependent, absent from these captures.

## YouTube Shorts (measured 2026-08-10, live m.youtube.com/shorts DOM)

**Right rail** — axis 91.9% vw, icons ~32pt: **three bare white actions**, no grey
chips — like (thumbs-up outline) + count `50K`, comment (outline) + count `296`,
share (forward arrow, no count), then a **square sound thumbnail** (~40pt). No
dislike and no remix on the rail (the old chrome drew both).

**Top**: YouTube/Shorts wordmark left, search magnifier + kebab (vertical dots)
right. **Bottom-left**: avatar + `@handle` + **Subscribe pill — near-black
`#0f0f0f`, not red** (YouTube dropped the red Subscribe years ago) + caption +
sound row.

Done in `shorts-chrome.tsx`.

## X — the new immersive player (Feb 2026 redesign)

X shipped a **brand-new immersive vertical video player** on iOS in Feb 2026. It
has **no vertical rail and no back-header** — a from-memory drawing (and the old
`x-chrome.tsx`) is wrong. Source: X's own announcement render + App Store v12.15
(the live site is fully login-walled). Done in `x-chrome.tsx`.

- **Author block** (bottom, above caption): small avatar (~7% vw) · name white
  bold · verified seal **`#1D9BF0`** · `@handle · 1h` dim on the line below · a
  **Follow pill on the right edge** (~19% vw, translucent light fill, white bold).
- **Caption**: white, 2 lines, ellipsis-truncated.
- **Action row — HORIZONTAL pills** (translucent black ~25-30%, fully rounded,
  ~30pt tall), left→right: reply `248` · repost `3.3K` · **like — heart OUTLINE,
  white, not filled/pink** `19K` · bookmark (icon-only) · share (icon-only). All
  white outline.
- **Media control bar** below the pills (new, easy to miss): a thin **scrubber**
  (white filled ~38% + faint track); under it a **play triangle + `-0:20`** left,
  and volume · expand · PiP cluster right. Gentle bottom scrim.
- The **timeline** in-feed post differs: like is **filled pink `#F91880`** there,
  and it carries a **views-bars** count. The immersive player's like is outline.
- Palette: monochrome white-on-black; accents verified `#1D9BF0`, timeline like
  `#F91880`.
- Unverified: the immersive player's top bar (close/overflow, cropped), exact
  pill alpha.

## LinkedIn — the immersive "Video"-tab player (new)

LinkedIn now has a **separate full-screen Video-tab player**, distinct from the
in-feed card the old `linkedin-chrome.tsx` drew. Source: recent press
renders (live is login-walled). Done in `linkedin-chrome.tsx` (as the immersive
player — the card belongs to the feed, not the Video tab this section previews).

- **Right rail** (vertical, white, ~91-93% vw): like — **thumbs-up, SOLID** `258`
  · comment — **solid white bubble with knocked-out text lines** `14` · share —
  **solid forward arrow**, no count · volume/mute (lower, separated; solid).
  (First pass of this doc said outline; the capture crops are unambiguous —
  every rail glyph is solid.) **No repost and no send in the rail** — those
  live only in the feed card, so copying the card's four actions onto the rail is
  wrong.
- **Author + caption** (bottom-left, above the nav): avatar (~7.8% vw) · name
  white bold · **Follow pill — outline** (thin white/grey border, transparent,
  white text, fully rounded) immediately after the name · grey headline line ·
  white caption ending `…see more` · a thin scrubber below.
- **Bottom nav** — **opaque white**, ~70pt, 5 tabs: Home · **Video (2nd, selected:
  filled black play-glyph in a rounded square, black label)** · My Network ·
  Notifications (red `#CD141A` `20+` badge) · Jobs. The video does **not** run
  edge-to-edge at the bottom.
- Palette: brand blue **`#0A66C2`** (exact), notification red `#CD141A`, rail pure
  white.
- The existing in-feed card is also correct and only misses a leading
  **your-avatar + dropdown caret** at the far left of its action row.
- Unverified: whether the immersive rail also shows the user's own avatar at top;
  exact tab spacing; the reacted-state like colour.

Source captures were in `/tmp/social-probe/` and `/tmp/social-probe2/`
(ephemeral). Re-run the reconnaissance to regenerate them.
