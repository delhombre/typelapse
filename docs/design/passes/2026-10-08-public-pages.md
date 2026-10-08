# Pass: the views outside `/` and `/app`, 2026-10-08

## Screen

The strip an `#import=` link raises (its status and its replace question), the
public render page `/v/:id` and its dead ends, the return from checkout on
`/app?billing=`, the screens before the bundle (`#boot-failed`, `<noscript>` in
`index.html`), the 404 and the route error face, and the studio skeleton's phone
row. Out of scope: the landing, the studio shell and panels, the account island and
the toast host (`notice-host.tsx` belongs to another builder).

Decisions: `docs/decisions/2026-10-08-public-pages-fix.md`. Audit:
`docs/decisions/2026-10-08-design-audit.md` (D2, D9).

## Before

`.craft/evidence/2026-10-08-design-audit/public-pages/` (390, 360 and 1440, light and
dark). Measured there:

- The import status was a pill of Tailwind's cold ramp: `border` beside a 16px/40px
  shadow, `font-mono text-[11px]`, `text-red-600` on `bg-neutral-900`, no icon and no
  next step, mounted outside `studio-root sc-tokens`.
- The replace question started at `max(0.75rem, env(safe-area-inset-top))` on
  desktop, over the Preview/Edit switch, and at 360 its bottom (y 253 of 780 with four
  lines of text) covered the frame's top.
- `/v/:id` for a 9:16 video: the action at about y 797 of 844 on a phone, an about column
  under a 354px-wide frame on a desktop; the dead ends were one sentence in an `h1`;
  no `.ico`, no touch icon, no `og:image:alt`; `/v` and `/v/` in local mode answered
  Hono's plain text.
- `/app?billing=success` and `?billing=cancelled` rendered the plain studio.
- The pre-bundle screens were `system-ui` on white in every theme, left-aligned, with
  a 19px link target.
- The 404 and the error face had no mark and the landing's `og:*` tags; two actions
  side by side at 360.
- The skeleton's phone row drew 141, 68, 150 and 44px chips where the real row has
  139 (it gives), 67, 98 and 42, at a 6px gap and 9px margin (real: 8px, 4px under
  390, and 10px).

## Decisions

- `emil-surfaces`, `emil-color`: the import status reads `--camera-surface`,
  `--camera-material-shadow` (ring inside the stack, no border), `--r-surface` and
  `--camera-danger`; `studio-root sc-tokens` is on its host (audit D2, D9).
- `emil-typography`: the status is `--font-sans` at `--sc-text-md` with the reason at
  `--sc-weight-medium`; the dead ends are an `h1` and an ash `.reason`; the boot
  screens are Geist with the heading at 600 and `text-wrap: balance`.
- `emil-design-foundations`: an error is the danger ink, an icon and a next step
  ("Check the link, or paste the diff instead."); one `h1` for every dead end.
- `emil-marketing-pages`, `emil-mobile-native`: the render page's phone cap is
  `--cap: 60svh` for a portrait video and a two-line title; the boot screens clear
  the safe areas and use `100dvh`; the link's target is padding, not layout.
- `emil-ui-polish`, `emil-touch-and-accessibility`: Dismiss is 28px drawn, 40px to a
  pointer, 44px under `(pointer: coarse)`, pressed at `scale(0.97)` over 100ms
  `var(--ease-out)`; the render page's links take `touch-action: manipulation`.
- `emil-ui-review`: see below. `craft-design-engineering` (shadows, not borders; nested
  radius): the Dismiss is `--r-control` inside a `--r-surface` strip with 6px
  between them.
- Rows updated in `SYSTEM.md`: the touch row for the popover controls takes the
  import status's Dismiss; the type row for the studio face now names its selector.

## After

`.craft/evidence/2026-10-08-public-fix/after/` against `before/` (the audit's own
captures), at 390, 360 and 1440, light and dark. Replayed by
`capture.mts` (the audit's script, repointed): the question ends at y 235 against a
frame starting at 253 at 360, the `/v` portrait action sits at y 727 to 771 of 780 and
730 to 774 of 844, and the desktop question starts at y 76. Tests: `billing-return`,
`import-status`, `boot-screens`, `route-state-head`, `studio-skeleton-row`,
`render-page-route`, `render-page-tokens`, `source-import-replacement`, the docs tests
and `bash .craft/verify.sh`.

## Review verdict

Approve with changes, and made: the render page's links lacked `touch-action`, and the
Dismiss had no pressed state.

## Open

- The notice host draws the same "!" icon for an info notice ("Creator is on.") as for
  an error; the host is another builder's.
- `.sc-confirm-float` is tightened by media query (1279px) rather than by measuring the
  room above the frame: below 320px wide the question would reach the frame again.
- The e2e specs for the import strip were not run (they need a browser stack of their
  own); the unit tests and the manual replay above cover the same boxes.
