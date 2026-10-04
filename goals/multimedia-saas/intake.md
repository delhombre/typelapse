# Goal intake — multimedia SaaS

## Objective

Turn Typelapse from a code-only local editor with hosted stubs into a scene-based
multimedia motion studio that works for code, text, images, video and audio,
while keeping the current local editor usable without an account. Add the real
SaaS path (identity, persisted projects/assets, subscriptions, hosted renders),
then reshape the product UI around those capabilities with the interaction
quality of `ui.camera` adapted to Typelapse.

## User-visible outcomes

1. A project can mix code, text, images, video and audio in ordered scenes.
2. Existing code projects still open and render with their current magic move.
3. A visitor can use the local studio without a backend; an account can sync
   projects and assets across sessions.
4. Creator/Studio checkout, entitlement changes and the billing portal use real
   Stripe flows when hosted configuration is present.
5. A paid account can submit a durable hosted render, leave the page, return,
   and retrieve the resulting file. Jobs and assets are tenant-scoped.
6. The refreshed studio makes scene creation, media import and timeline editing
   direct, calm and coherent rather than exposing the implementation model.

## Non-goals for the first production cut

- A free-form Canva/Figma canvas or arbitrary nested layer tree.
- A full nonlinear video editor with multitrack ripple editing.
- Real-time multiplayer editing.
- Usage-based billing before render cost data exists.
- A microservice split or a provider-specific domain model.
- Rebranding Typelapse before the mixed-media product has been tested.

## Authority and safety

- Allowed: edit and test the isolated worktree, add migrations and dependencies,
  run local services and browser QA.
- Not implied: deploy, push, merge, create paid cloud resources, or mutate a
  production Stripe/Neon/R2 account.
- All hosted capabilities fail closed when their configuration is absent.
- No user project bytes, secrets, cookies or source code in logs.

## Baseline

- Branch: `codex/multimedia-saas`
- Base: `06d247bf8d642b74b40c93e1844e3730509bff88`
- Worktree: a temporary worktree outside the repository
- Sensors: 1,027 tests green; client typecheck green; production build green.
- Existing hosted state: Better Auth is server-only; billing and cloud render
  are explicit stubs; only auth tables exist in Postgres.
