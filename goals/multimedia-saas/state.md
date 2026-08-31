# State

## Current

- Phase: the scene-first multimedia studio, local persistence/export, hosted
  backend boundaries, auth and billing flows are implemented and validated in
  an isolated worktree.
- `Project → Scene → Block → Asset` is the canonical model. A scene may combine
  text, code, image and video blocks, while audio cues live on an independent
  track. GitHub URLs and unified diffs are optional structured inputs, not the
  product model.
- The studio has proportional scene timing, a real playhead, drag reordering,
  scene transitions, layer inspection, audio timing, undo/redo and IndexedDB
  autosave. No destructive action waits for a toast to disappear.
- DOM preview and the V2 Remotion renderer consume the same canonical scene
  timeline and layout math. The local MP4/WebM route produces a real V2 video
  without silently uploading source media.
- Hosted mode provides owner-scoped project revisions, private R2 media,
  authenticated render jobs, fenced workers, object-deletion outbox processing
  and expiring result access.
- Better Auth email/password account flows are mounted in the studio account
  island. Local mode remains explicitly account-free.
- Stripe Checkout supports monthly and annual Creator prices selected by
  cadence; Customer Portal and idempotent signed webhooks project the plan
  server-side. The landing and account UI only display prices retrieved from
  Stripe through the public catalog endpoint.
- `pnpm hosted:check` validates that every hosted capability can be mounted and
  fails closed with an explicit capability list when credentials are missing.
- Full validation: 181 test files / 1,569 tests, Biome, client and server type
  checks, and the production build all pass.
- A disposable PostgreSQL 16 instance accepted all four migrations and served a
  real Better Auth + project CRUD flow across a backend restart. The runtime now
  uses the standard `pg` pool instead of a Neon-only HTTP transport.

## Deliberate boundaries

- Cloud save and direct media upload remain hidden until the user explicitly
  authorizes that data transfer. Local authoring and export do not require it.
- Provider credentials and a production deployment are external configuration;
  no live managed PostgreSQL, R2, Stripe or email account was created by this worktree.
- Exact hosted storage/render allowances are deferred until export telemetry is
  available. The domain exposes capabilities without inventing unsupported
  marketing numbers.
- Captions and synthesized audio are still richer on the server renderer than
  the independent Canvas painter; this limitation is stated rather than hidden.

## Next gate

Configure a staging environment with managed PostgreSQL, R2, Stripe test mode and Better Auth,
run `pnpm hosted:check`, then exercise sign-up → checkout → webhook → private
asset → cloud project → queued render end to end. Enable the cloud-save handler
only after explicit upload consent.
