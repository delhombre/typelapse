# CLAUDE.md: Typelapse

## Project

Scene-first multimedia motion studio that turns a pull request, a diff or a snippet into a code video.
On-device export needs no account and uploads nothing; hosted renders and private projects are the paid side. AGPL-3.0, commercial licence on request.
Think "timelapse for code": step-by-step typing animations, syntax highlighting, smooth transitions, export to MP4/GIF/WebM.

## Design System

Read `docs/design/SYSTEM.md` and `docs/design/DECISIONS.md` before touching a screen.
For motion detail:
- `.agent/skills/premium-motion-design/SKILL.md` (git-ignored, main checkout only): Jony Ive-inspired motion design: spring tokens, interaction patterns, component styling rules, Typelapse-specific patterns (code frame, step timeline, theme picker, playback controls, export panel)

## Stack

- Vite + React 19 + TypeScript
- Shiki: syntax highlighting (VS Code engine)
- Motion (motion/react): spring-based animations
- WebCodecs + mediabunny (MP4/WebM) and gifenc (GIF): client-side rendering in a worker. The default path: nothing uploaded, no server to run
- Remotion: server-side video rendering, the fallback and still the only path that bakes captions and audio
- Hono: lightweight API server for render endpoint
- Tailwind CSS v4: styling
- Zustand: state management
- Vitest: testing
- Biome: linting/formatting (NOT ESLint/Prettier)

## Architecture: Clean Architecture / Hexagonal

```
src/
├── domain/          # Pure entities, value objects, ports (ZERO framework deps)
├── application/     # Use cases and orchestration
├── infrastructure/  # Adapters implementing ports (Shiki, export)
└── presentation/    # React UI layer (components, hooks, stores)
server/
├── remotion/        # Remotion composition (code frame, transitions)
├── routes/          # API routes (POST /api/render)
└── index.ts         # Hono server entry point
```

Layers, not feature folders, are the top-level split on purpose:
`tests/architecture/dependency-rule.test.ts` enforces their import rules.

**Three renderers, one picture.** The same frame is drawn by the DOM preview
(`src/presentation/components/preview/`), the Remotion composition
(`server/remotion/`, which imports those same React components), and a third,
independent 2D-canvas painter (`src/application/frame-painter/`) that renders
the client-side export. WYSIWYG is therefore a discipline, not a property: any
visual feature has to land in all three, or the preview, the server video and
the on-device video stop agreeing. Put the math in `src/application/` (pure,
shared) and keep the painter's paint order matching the composition's.

### Domain (done)
- **Entities**: `Snippet`, `Step`, `Theme`, `RenderConfig`
- **Value Objects**: `HighlightRange`, `TimeRange`, `Plan`, `Role`
- **Ports**: `HighlighterPort`, `RendererPort`, `ExporterPort`, `AuthPort`
- Entities are immutable: methods return new instances
- Factory methods (`create()`) with validation, no raw constructors

### Application: Magic-move engine (done)
The signature feature: a **pure, dependency-free token-morphing engine** shared by
the browser preview and the Remotion video, so the exported MP4 matches the preview
frame-for-frame (WYSIWYG).
- `src/application/magic-move/engine.ts`: layout tokens on a monospace grid (`ch`/line
  units, no DOM measurement), diff two frames, and interpolate a staggered morph
  (shared tokens glide, removed fade out, added fade in).
- `src/application/magic-move/timeline.ts`: hold/transition segment math.
- `src/infrastructure/highlighting/magic-move-keyer.ts` (client) and
  `server/remotion/magic-move-plan.ts` (server) turn Shiki tokens into a keyed,
  synced plan via `shiki-magic-move/core` (`enhanceMatching` + `splitTokens`).
- `src/presentation/components/preview/magic-move-canvas.tsx`, `grain-overlay.tsx`,
  `reels-progress.tsx`, `step-caption.tsx`: shared presentational renderers used by
  BOTH the preview and the Remotion composition.
- `src/application/export/video-script.ts`: the whole video as a pure function of
  frame number, which is what makes the encoder and the scrubber agree.

### Video output: matches/beats snipcast (done)
- **Smooth two-beat morph** (`engine.ts` timing): existing tokens glide to place
  first, then new tokens fade in: no mid-transition crossing/clutter. easeInOutQuart.
- `src/application/backgrounds/mesh-gradient.ts`: **animated flowing mesh-gradient**
  backgrounds, pure + time-driven (rAF in preview, frame-driven in video), loops seamlessly.
- **Aspect-ratio presets** (16:9 / 1:1 / 9:16 / 4:5 / 3:4) for Reels/Shorts/TikTok.
- **Loop**: appends a last→first morph so a looping player never hard-cuts.
- **Progress styles**: reels (segments) / bar / none, baked over the video.
- **Typewriter mode** (`typewriter.ts`): our addition: type the first step out
  character by character with a moving caret. snipcast has no equivalent.
- Grain texture + macOS/web/terminal chrome + glow + `01`-padded line numbers.

### Tests
- `tests/domain/*`: Snippet, Step, value objects, Plan, Role, org/member/workspace
- `tests/application/*`: magic-move engine + timeline, mesh gradient, typewriter,
  diff parsing/windowing/chaptering, focus zoom, caption timing, layout math,
  frame-painter (4 files), export resolution, tick synth, safe zones
- `tests/infrastructure/*`: video encoding, GIF quality + timing, auth adapter
- `tests/presentation/*`: stores, import intent, template catalog, swipe cancel
- `tests/architecture/dependency-rule.test.ts`: the layer import rules, enforced
- `tests/server/*`: caption width, watermark scale, hosted-render auth

## Coding Principles

- **TDD**: Write tests FIRST (red), then implement (green), then refactor
- **SOLID**: Single responsibility, dependency inversion via ports
- **Clean Code**: No dead code, no premature abstractions
- **Immutability**: Domain entities return new instances on mutation
- **Biome**: No nested ternaries, block statements required, organized imports

## Dev Commands

```bash
pnpm dev          # start Vite dev server (frontend)
pnpm dev:server   # start Hono API server (backend, port 3001)
pnpm test         # run tests
pnpm test:watch   # watch mode
pnpm build        # production build
pnpm lint:fix     # biome fix
pnpm check-types  # typecheck
```

## Current Status

**Check this list before building anything.** It has been stale before, and a
stale list gets features rebuilt that already exist. Grep first.

Studio, all working:
1. **Shiki adapter**: all bundled languages lazy-load on demand; 7 themes
2. **Zustand stores**: snippet, export, diff-import, social preview, plan
3. **Monaco editor** + step builder: controlled value, syncs on import/share
4. **Live preview**: engine-driven, WYSIWYG with the export
5. **Playback**: token-level magic-move (shared engine), not a crossfade
6. **Line focus + zoom**: per-step ranges ("2-4, 7") dim the rest
   (`application/focus/line-ranges.ts`), and `focus-zoom.ts` pushes in on them
7. **Per-step captions**: `application/captions/caption-timing.ts` +
   `preview/step-caption.tsx`, stored as `Step.annotation`
8. **Sound**: `application/audio/tick-synth.ts` synthesizes key ticks and morph
   thumps as a pure function of the timeline
9. **Template gallery**: 6 starter projects (`application/templates/catalog.ts`)
10. **Social preview**: real TikTok/Reels/Shorts/X/LinkedIn chrome over real safe
    zones (`application/social/safe-zones.ts`), preview-only, never exported

Import, all working:
11. **Diff → steps**: unified-diff parsing, windowing with `⋯` separators, and
    per-commit chaptering (`application/diff/`)
12. **PR / commit / file URL import**: pure resolvers in `application/import/`,
    fetched token-free from api.github.com in `infrastructure/import/`
13. **Hero live import**: the landing field carries a paste into the studio over
    a `#import=` deep link (`presentation/utils/import-intent.ts`), consumed once
    by `import-intent-boot.tsx`

Export, all working:
14. **On device (default)**: WebCodecs + mediabunny in a worker
    (`infrastructure/export/render.worker.ts`), painted by the frame-painter.
    MP4/WebM/GIF, 1080p/1440p/4K (`RESOLUTION_TIERS`)
15. **On the server**: Remotion, same engine, the fallback when the browser has
    no encoder. Still the only path that bakes captions and audio: the painter
    does neither yet (`frame-painter/scene.ts` hardcodes `hasCaption: false`)
16. **Share by link, JSON in/out, PNG snapshot, watermark**

Landing page (`src/presentation/landing/`): a full marketing page running the
real engine as its product shot. Haptics (`src/presentation/haptics.ts`) are
shared by the landing and the studio controls.

Auth (better-auth): passwordless, a six-digit code sent by mail (email OTP over
SMTP behind `MailPort`, maildev locally via `compose.dev.yaml`). Sign-in from the
studio's account island (`studio-account-island.tsx`) and the cloud-render control. The client has two
routes (`/` and `/app`).

NOT wired, do not describe as shipped:
- **Teams / workspaces**: the domain entities exist and are tested, but nothing
  imports them outside the tests. No adapter, no service, no UI
- **Upgrade UI**: `upgrade-button.tsx` is not mounted anywhere. The billing
  adapter and `plan.store.ts` are real: hosted mode resolves the signed-in plan,
  local mode runs on `Plan.local()`

## User Preferences

- Language: French
- Software craftsmanship: clean archi, DDD, TDD, SOLID, design patterns
- Run `pnpm test` and `pnpm check-types` periodically

## How we work

Every unit of work runs the gates in `docs/agents/QUALITY_LOOP.md` (Frame,
Grill, Model, Build, Interface, Prove, Ship) and records its decisions in
`docs/decisions/`. Skills come from three sources, by domain:

| Domain | Source | Skills |
| --- | --- | --- |
| Engineering: tickets, design, tests, review, bugs | Matt Pocock's plugin, always called by namespace | `mattpocock-skills:to-tickets`, `mattpocock-skills:triage`, `mattpocock-skills:grilling`, `mattpocock-skills:domain-modeling`, `mattpocock-skills:codebase-design`, `mattpocock-skills:tdd`, `mattpocock-skills:diagnosing-bugs`, `mattpocock-skills:code-review`, `mattpocock-skills:research` |
| Working discipline | Pstack | `pstack-principles`, `why`, `how`, `blast-radius`, `show-me-your-work` |
| Interface, motion, marketing pages | Emil Kowalski's aiforui course and skills, then Gustavo Fior's Craft | `emil-*` in the course's order, then `craft-design-engineering` after `emil-ui-polish` |

There are no custom agents or subagent definitions. Work goes to the built-in
agents with a model and a brief that names its gate's skills. The orchestrator
is Fable, or Opus while Fable's weekly limit is reached, and never edits
product code. Builders run on Sonnet; a task Sonnet cannot finish goes to Opus
with the failure named in the brief. Inventories go to `Explore` on Haiku.

## Agent skills

### Issue tracker

Work is tracked in GitHub Issues for `delhombre/typelapse`, mirrored in GitHub Project 4 "Typelapse". See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical Matt Pocock skill labels. See `docs/agents/triage-labels.md`.

### Domain docs

Typelapse is single-context: `CONTEXT.md` at the root, decision logs under `docs/decisions/`. See `docs/agents/domain.md`.

<!-- craft-harness:start (managed by /craft-harness:setup; edit freely, the markers are the only contract) -->
## Working style (craft-harness)

- Kind: web (Vite + React studio) with a Hono API. Verification gate: `bash .craft/verify.sh` (lint, check-types, typecheck:server, test). A subagent that changed files cannot finish until it passes; fix root causes, never weaken a test or a rule to pass.
- Method: `tdd` on logic that matters, `domain-modeling` keeps `CONTEXT.md` current, `codebase-design` for module boundaries, `pstack-principles` (Laziness Protocol, Prove It Works, Fix Root Causes). Smallest diff that solves the problem.
- UI/UX: load the matching `emil-*` skill and `craft-design-engineering` before interface work; `docs/design-direction.md` is the point of view to express. Run `emil-unslop-design` before shipping a screen.
- User journeys: tester.army `e2e` (`npx e2e guide` for the API); recorded flows replay without a model.
- Review: `/code-review` on the branch before merge. Done means `/craft-harness:verify` reported SHIP.
- Running state for long work lives in `.craft/STATE.md` (plan, decisions, file ownership).
<!-- craft-harness:end -->
