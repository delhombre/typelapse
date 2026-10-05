# Pass: public render page, 404 and error states, 2026-10-05

## Screen

Ticket #136, decision log `docs/decisions/2026-10-05-ui-passes.md` D2 and D3.
Desktop and phone.

- `/v/<id>`, the public page of a Cloud render, and its 404 and 503 pages:
  static HTML with inline CSS served by the API, `server/routes/render-page.ts`.
- Any unknown SPA address: `src/presentation/components/ui/not-found.tsx`.
- The route error boundary under `/` (landing copy) and `/app` (studio copy):
  `src/presentation/components/ui/route-error-boundary.tsx`, wired in
  `src/app-routes.tsx` (unchanged).
- The first-paint theme script in `index.html`.

Out of scope: routes, status codes, Open Graph and Twitter tags, cache
headers, the native video controls, the project title (document data).

## Before

Screenshots in the session scratchpad (`136/before/`): `public`,
`public-404`, `not-found`, `studio-error`, `landing-error`, each at 1440x900
and 375x812, light and dark, taken with the ms-playwright Chromium against a
hosted build (5305, API 3305, PostgreSQL and MinIO in throwaway containers)
and a local build (5315). The studio error was forced by aborting the
`studio-route-*.js` chunk, the landing error by making `localStorage` throw.

- Landing error state on a dark OS painted light paper: `main` measured
  `rgb(250, 249, 246)` and `html` `rgb(250, 250, 249)`. Two causes. The
  inline script read storage inside the one `try`, so a throwing read gave up
  on the OS answer too. And `.route-state` turns dark only under the studio's
  `.dark` class, while the landing marks its theme with `data-landing-theme`,
  which `use-landing-theme.ts` removes as the landing unmounts.
- SPA 404 and error fallback filled their action with ink
  (`bg-ink text-paper`), against SYSTEM.md "every filled action wears the
  primary". The second action was bare text with no hover and no press. Both
  actions were `px-4 py-2` at 13px, about 36px tall, under D10's 44px.
- Their type was 15px semibold over 13px ash, a toast-sized block alone in
  the middle of a 1440 page.
- Public 404 and 503: one `<p>` and nothing to do but the footer link. A
  shared link that went dark ended the visit.
- Public page at 375: `main` centred the stage vertically, leaving about
  200px of empty paper above the video and the same below the action.
- Public page button: flat primary, no glow; the landing's filled actions
  carry `0 6px 20px -6px var(--color-primary-glow)`.
- Public video frame in dark: the depth shadows were invisible on `#121110`
  and the ring was the warm tinted hairline `rgb(245 243 239/.12)`.
- Public page under reduced motion: `.button { transition: none }` dropped the
  colour fade too (the SYSTEM.md Drift 8 pattern).

## Decisions

- foundations: the SPA 404 and the error fallback share one material,
  `ROUTE_STATE` (`route-error-boundary.tsx:15`), imported by `not-found.tsx`:
  heading 22px (24px from `sm`) semibold, tracking -0.012em, balanced; body
  15px/24px ash, max 38ch, pretty; actions 24px below.
- foundations: one filled action in `bg-primary text-on-primary` with the
  landing's glow, `0 6px 20px -6px` resting and `0 11px 28px -7px` on hover;
  the other a quiet text action in ash that turns ink on hover. Both `h-11`
  (44px).
- foundations: the public 404 says its sentence as the page's `h1` and offers
  "Make one in the studio" (`<app origin>/app`). Status 404, `no-store`, no
  `og:video` and the same document for private, missing and expired, as
  before.
- foundations: on a phone (under 640px) the public stage takes
  `margin-block: 0 auto`, so the video leads and the free paper goes below.
- foundations: theme. The inline script reads storage in its own `try`
  (`index.html:27`), so a blocked storage still gets the OS theme. The
  boundary reads the theme at the moment of the throw
  (`darkAtFailure`, `route-error-boundary.tsx:34`: the root's `.dark` or
  `data-landing-theme="dark"`) and wraps its fallback in `.dark`, so the
  existing `.dark .route-state` remap applies on `/` too.
- marketing-pages: the public page already follows it: video first, facts in
  one tabular line, one primary, "Made with Typelapse" as the footer, font
  and poster preloaded, `aspect-ratio` on the stage, no motion of its own.
  Kept as is.
- surfaces: the video frame takes the landing's code-frame depth, light
  `0 0 0 1px oklch(0 0 0/.07), 0 2px 6px -2px oklch(0 0 0/.08), 0 12px 32px -10px oklch(0 0 0/.16), 0 26px 60px -18px oklch(0 0 0/.14)`;
  dark `0 0 0 1px oklch(1 0 0/.09), 0 12px 32px -10px oklch(0 0 0/.55)`
  (`render-page.ts:74`, `:86`). Radius stays 12px, the code card default.
- surfaces: the public button gets the primary glow, the same two values as
  above (`render-page.ts:173`); `--primary-glow: rgb(241 190 1/.45)` mirrors
  `--color-primary-glow`.
- polish: reduced motion on the public page keeps
  `transition-property: background-color, box-shadow` and drops the press
  (`render-page.ts:233`). The SPA actions use `motion-reduce:active:scale-100`
  and the global allow-list does the rest.
- polish: the SPA text action gets the press too.
- review: the public 503 gets "Try again", a link to the request's own path
  (`render-page.ts:373`), since its sentence tells the reader to try again.
- unslop: not run. Nothing reads generated: no gradient, glass, badge or
  icon grid; two plain states and one video page.
- animations: not run. Nothing on these pages moves on its own.

Motion, all of it: hover `background-color`, `box-shadow` (and `color` on
the text action) over 150ms `cubic-bezier(.23,1,.32,1)`; press `scale` to
0.97, 160ms on the public page (the landing's `PRESS_DURATION`) and 150ms in
the SPA, same curve. Nothing else animates.

Proposed for DECISIONS.md (the orchestrator folds it in, U0 owns the file):
"State pages wear the landing: the 404s and the error fallbacks use the
paper palette at both temperatures, one primary with its glow, one text
action, 44px targets, and always one way on." Why: three styles for one
family before this pass. Enforced by: `ROUTE_STATE` and the
`render-page-route` 404 and 503 tests. Pivot: "error pages stay bare".

## After

Same 20 screenshots in `136/after/`; between runs, `136/run2/` (after
foundations) and `136/run3/` (after the material skills). On a dark OS, all
five surfaces now measure `main` and `html` at `rgb(18, 17, 16)`.

Crawler: `curl` of `/v/<id>` before and after, the 23 head tags (12 `og:`)
are identical byte for byte. `/v/job_nope`: `404`, `cache-control: no-store`,
zero `og:video`, one `Make one in the studio` link.

Tests, all focused:
- `pnpm exec vitest run tests/server/render-page-route.test.ts tests/server/render-page-repository.test.ts tests/presentation/route-not-found.test.tsx tests/presentation/route-error-boundary.test.tsx tests/presentation/landing-error-boundary.test.tsx tests/presentation/first-paint-theme.test.ts`:
  27 passed, 5 failed at first; the 5 were "the owner's public page controls",
  a fixture time bomb fixed in the follow-up below. `pnpm exec vitest run tests/server`
  after both follow-ups: 256 passed, 44 files.
- New, each seen red first: storage blocked still answers the OS
  (`first-paint-theme`), the landing fallback keeps a dark landing theme
  (`landing-error-boundary`), the 404 offers the studio and the 503 offers
  Try again (`render-page-route`).
- `pnpm e2e:hosted --grep "public"` on ports 5305/3305 with the throwaway
  services: 3 passed before (58.6s), 3 passed after (39.5s).

## Review verdict

Approve with changes. Nothing blocking.

Should fix:
- The public 503 had no recovery action. Done: "Try again".

Nits, not done:
- The 404 and error states in the SPA carry no "Made with Typelapse" footer
  like the public pages do.
- A project left as "Untitled" showed that word as the public page's `h1`.
  Done in the follow-up below.

## Open

- A landing that throws after it has mounted removes `data-landing-theme`
  on unmount, so the overscroll area behind the (now dark) fallback falls
  back to the studio's light `#fafaf9` and `theme-color` returns to the OS
  value. Only visible on rubber-band; owner: landing pass.
- `requireHostedAccount` (`server/auth/hosted-render-guard.ts`) still reads
  `new Date()` rather than an injected clock, unlike the projects, assets and
  billing routes. Tests stay safe with a far-future session; injecting `now`
  is a server change left to the orchestrator.

## Follow-up, same day

- Fixture time bomb: `signedInAs` in `tests/server/render-page-route.test.ts`
  built its session as the fixed `NOW` (2026-10-04T12:00) plus 60s, and the
  hosted guard compares with the wall clock, so 5 tests failed from
  2026-10-05. The session now expires on 9999-12-31. Swept with
  `rg "2026-10-0" tests/server tests/presentation`: the other sessions either
  use `Date.now()` (`cloud-render-status`, `create-app-capabilities`,
  `hosted-render-auth`) or go through routes that take an injected `now`
  (`projects-route`, `assets-route`, `billing-route`); the remaining dates are
  signed-URL and lease expiries no code compares with the clock.
- Page title, decided by the orchestrator: the project title when the user
  named it (not blank, not "Untitled" or "Untitled N"), else the first
  non-blank line of the first text layer in scene and layer order (cut to 80
  characters with an ellipsis), else "A Typelapse video". One value feeds the
  `h1`, `<title>`, `og:title`, `twitter:title` and the video's `aria-label`:
  `publicTitleOf` in `src/application/render/hosted-render-page.ts`. Test seen
  red first in `render-page-route.test.ts`.
