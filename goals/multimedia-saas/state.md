# State

## Current

- Phase: the studio at `/app` runs on the V2 document end to end, the
  headless render (CLI, GitHub Action, agent skill) ships beside it, and the
  hosted backend, auth and billing are built and wait for a staging run.
- `/app` is `StudioRoute`: `ResponsiveShell` (StudioEditor, SceneInspector,
  StepBuilder, LivePreview and StudioTimeline) over `StudioCompositionBridge`,
  which keeps the code steps and the composition (layers, media, audio cues) in
  one V2 project. The account island (`studio-account-island.tsx`, built on
  `StudioAccountControl`) appears in a hosted build only. The standalone
  `MultimediaStudio` screen and its export panel are deleted; their tests now
  run against these components.
- `Project → Scene → Block → Asset` is the canonical model. A scene may combine
  text, code, image and video blocks, while audio cues live on an independent
  track. GitHub URLs and unified diffs are optional structured inputs, not the
  product model.
- The studio has proportional scene timing, a real playhead, drag reordering,
  scene transitions, layer inspection, audio timing and undo/redo. No
  destructive action waits for a toast to disappear.
- One playback clock (`src/application/studio-timeline/playback.ts`) gives the
  playhead, the readout, the ruler and the export the same duration. One scene
  is a playable video. The frame rate (24, 30 or 60) is chosen in the export
  panel and carried by the project file.
- The DOM preview, the V2 Remotion composition and the Canvas painter share the
  scene timeline and the layout math, and size the card from the same measured
  width. On-device export writes MP4, WebM (up to AV1 4:4:4) and GIF; the local
  MP4/WebM route renders the same V2 document without uploading source media.
- Local projects live in an IndexedDB library, each with its own V2 document
  and autosave. The project file saves and opens the whole V2 document, media
  named by metadata and never embedded; V1 files open through the migration.
- Headless render: `pnpm typelapse render <pr-url|commit-url|diff|project.json>`
  drives the server render route in process. `action.yml` at the repository
  root renders a pull request on the runner, uploads the video and keeps one
  comment with the studio link up to date; `skills/typelapse-pr-to-video` lets
  an agent do the same in one prompt.
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
- The gates are in `docs/agents/QUALITY_LOOP.md`; the full suite, both type
  checks, Biome and the production build run before every commit.
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
- The studio's export panel does not submit hosted renders yet: its cloud path
  is still the `/api/cloud` stub, and the V2 hosted render jobs are reachable
  only through the API.
- The headless render (CLI, Action, skill) writes 4:2:0 chroma (H.264 or VP8
  through Remotion); AV1 4:4:4 comes from the on-device WebM export only.

## Next gate

Configure a staging environment with managed PostgreSQL, R2, Stripe test mode and Better Auth,
run `pnpm hosted:check`, then exercise sign-up → checkout → webhook → private
asset → cloud project → queued render end to end. Enable the cloud-save handler
only after explicit upload consent.
