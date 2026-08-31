# Execution plan

Each slice is merged into the integration worktree only after its focused tests,
typecheck and architecture rules are green. Full-suite/build/browser sensors run
at milestones rather than concurrently.

## Slice 0 — contract and baseline

- Record product/architecture/security contracts and current sensors.
- Challenge queue, billing plugin and migration strategy independently.
- Add no dependency until its compatibility spike has a pass/fail criterion.
- Introduce `DeploymentMode` configuration immediately: hosted mode disables the
  anonymous synchronous Remotion route. Remove automatic server fallback from
  local export; cloud is opt-in and capability-labelled.

## Slice 1 — versioned multimedia domain (TDD)

- Add immutable `Asset`, `AudioCue`, `Block`, `Scene`, `Project` entities and
  validation, including audio-only projects, owned media references and a
  canonical duration spanning both visual scenes and audio cues.
- Add V1/V2 parser, V1→V2 migrator and code-only V2→V1 rollback adapter.
- Extract the V1 parser from Zustand and derive deterministic legacy IDs so the
  same import has the same fingerprint.
- Compile code-only V2 projects into a shared render program.
- Decide JSON-vs-`.typelapse` portability semantics.
- Prove V1 round-trip and old/new frame parity at every hold/transition/loop
  boundary, including focus, typewriter and caption behavior.

## Slice 1b — converge code-only rendering

- Make `compileProject`/`frameAt` own resolved time, geometry, z-order and asset
  source time, while each adapter keeps its own drawing primitives.
- Route DOM, Remotion and Canvas code-only paths through that program before any
  new block reaches production.
- Embed a versioned font allowlist; hosted rendering performs no font-name-based
  fetch from Google.

## Slice 2 — first complete multimedia vertical path

- Add `TextBlock` to preview, Remotion and Canvas from one layer contract.
- Add `ImageBlock`, shared fit/focal math and local IndexedDB asset storage.
- Add video source-time/trim and audio cue/mix contracts at the same time, so
  architecture and UI are never allowed to assume code or still images.
- Replace data-URL draft coupling with asset references.
- Add a minimal accessible media/scene UI now; the premium visual pass remains
  later, but product interactions are tested in every slice.
- Prove text-only, image-only, video-only, audio-only and mixed
  code/text/image/video/audio projects before positioning work resumes.

## Slice 3 — hosted foundation and identity

- Extract `createApp(deps)` from the process entry point; add validated hosted
  config, request IDs, consistent safe errors, health/readiness and rate limits.
- Add tenancy/project schemas and migrations; fresh-Postgres migration sensor.
- Wire Better Auth React client: sign up/in/out/session and personal workspace
  provisioning in one transaction.
- Add project CRUD/autosave with optimistic concurrency and membership checks,
  but do not accept a hosted document that references unresolved local assets.

## Slice 4 — assets and project sync together

- Add S3-compatible storage adapter and signed upload/finalize/download flow.
- Enforce ownership, MIME/size/checksum/quota and cross-tenant denial tests.
- Model `local-only → uploading → ready → rejected/deleted`. Only finalized,
  owned assets may be referenced by a saved renderable revision.

## Slice 5 — durable cloud rendering before billing

- Implement `render_jobs`, state machine, idempotency and ownership. Submission
  references a canonical project revision; it never carries an arbitrary render
  program from the client.
- Prove the selected Postgres queue with double claim, SIGTERM/lease expiry,
  retry and deterministic output.
- Run the existing Remotion renderer in a separate worker process and store the
  result in object storage.
- Protect/disable the anonymous synchronous render path in hosted mode.

## Slice 6 — full video/audio renderer parity

- Add video metadata, trim/playback/mute and deterministic source-time math.
- Implement preview and Remotion video first; add Canvas/WebCodecs only behind a
  capability check with an explicit server fallback.
- Compile the existing audio cues into waveform metadata and a deterministic mix
  plan; do not introduce a second track-shaped project model.
- Prove mixed image/video/code/text/audio preview and MP4 output.

## Slice 7 — measured Creator billing

- Record pixel-second/media-minute cost and failure telemetry from hosted jobs.
- Implement a small Stripe adapter behind existing ports: server-owned price
  lookup, Checkout, raw signed webhook, unique event ledger, monotone
  subscription projection and Customer Portal.
- Prove duplicate and out-of-order webhook fixtures before granting entitlement.
- Ship Free + Creator only. Add Studio in a later Teams slice, not as copyware.

## Slice 8 — product UI and landing

- Read the project premium-motion skill, ask Emil, and audit `ui.camera` at the
  interaction level before changing surfaces.
- Reshape the studio around project/media/library, scene timeline, contextual
  controls, durable job state, auth and billing.
- Preserve fast local creation; reveal advanced controls progressively.
- Update landing positioning/pricing/demo to sell mixed-media outcomes, not PRs.
- Run measured browser QA, keyboard/accessibility, reduced-motion and visual
  comparisons at supported desktop widths.

## Final proof

1. Local mode boots and exports without any backend environment variable.
2. Fresh browser: sign up → session persists → project syncs.
3. Direct image and video upload → finalized private asset → signed preview.
4. Two identical submissions create one job; killed worker recovers it once.
5. Entitled user renders a mixed-media MP4 and downloads it; another tenant gets
   404/403 for project, asset, job and output identifiers.
6. Stripe test checkout → signed webhook → Creator entitlement → Portal cancel
   → Free, including duplicate/out-of-order webhook fixtures.
7. Preview, Remotion and Canvas stills agree within the declared tolerance for
   code, text, image and mixed fixtures.
8. Full tests, client/server typechecks, lint, production build and browser
   acceptance all pass serially.
