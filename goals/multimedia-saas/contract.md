# Delivery contract

## Product boundary

The product is a **scene-first multimedia motion studio**, not a PR video tool
and not a code editor with media bolted on. A pull request is only one optional
source, alongside manual creation and media import. The core workflows are:

- product launch: screenshots/clips + text + logo + soundtrack;
- tutorial/demo: screen media + zoom/callouts + captions + narration;
- code/release story: code/diff + explanatory text + optional media.

Every medium is independently valid: a project may be text-only, code-only,
image-only, video-only or audio-only. It may also layer and sequence all five.
The editing model must therefore never require a diff, a code block or even a
visual scene merely to create a valid project.

The editor keeps one ordered scene lane. Each scene has a deliberately small
z-ordered block list and one optional transition. This gives mixed-media power
without inheriting the complexity of a general-purpose NLE.

## Canonical content model

```text
Project
├── CanvasSettings / Theme / BrandKit
├── AssetMetadata[]       (bytes live behind AssetContentPort)
├── Scene[]               (ordered visual timeline, may be empty)
    ├── durationMs / transitionOut / caption
    └── Block[]           (ordered z-index, may be empty)
        ├── CodeBlock
        ├── TextBlock
        ├── ImageBlock
        └── VideoBlock
└── AudioCue[]            (global time-based mix, may be the only content)
```

`Step` and `Snippet` remain the legacy code model. They are not widened with
optional media fields. `ProjectDocumentV2` is versioned, serializes stable IDs,
and references asset metadata rather than embedding media bytes.

An `AudioCue` is one occurrence of an owned audio asset on the global project
timeline, not a lane or a visual block. Its V2 payload is
`{id, assetId, startMs, trim: {startMs, endMs}, gain, fadeInMs, fadeOutMs}`.
Times are non-negative safe integers, trim is non-empty and bounded by the
source duration, `gain` is normalized to `[0, 1]`, and fade durations must fit
inside the trimmed duration. The canonical field is `audioCues`; the unpublished
`audioTracks` spelling is rejected explicitly instead of being accepted as a
silent alias.

A project is valid when it contains at least one visual block or one audio cue.
Consequently, a blank visual scene is allowed and an audio-only project may use
`scenes: []`. Its canonical duration is the maximum of the complete visual
timeline (scene durations plus outgoing transitions) and every cue end
(`startMs + trim.endMs - trim.startMs`). Asset and aggregate IDs are unique;
every media reference must resolve to an asset owned by the project, and a
referenced audio asset cannot be removed.

## Compatibility

- A document without `schemaVersion` is V1 and is parsed by the existing strict
  validation boundary before migration.
- V1 steps become scenes containing one `CodeBlock` with a shared
  `continuityKey`. A no-step V1 document becomes one static code scene.
- `Step.annotation` becomes `Scene.caption`; focus, duration, language, theme,
  chrome, line numbers, canvas, aspect and motion settings are preserved.
- V2 code-only projects have a V2-to-V1 adapter for parity tests and rollback.
- Reading V1 remains supported. Writing switches to V2 only after round-trip and
  renderer parity sensors are green.

## Rendering contract

All renderers consume one pure, serializable `RenderProgram` produced by
`compileProject` and one `frameAt(program, frame)` function. DOM preview,
Remotion and Canvas/WebCodecs are adapters over the same `RenderFrame` layer
order and geometry.

- `MagicMovePlan` remains code-specific and compiles only between compatible
  code blocks sharing a continuity key.
- Image cover/contain/focal-point math is pure and shared.
- Video source time, trim and playback rate are calculated by `frameAt`.
- Audio is a deterministic cue/mix plan, not a visual block. Render adapters
  compile the aggregate's existing cues; they do not reinterpret them as tracks.
- The server resolves owned asset IDs; render input never fetches arbitrary URLs.

## Hosted architecture

One modular Hono application and one worker process share the same codebase and
Postgres. External boundaries stay behind ports:

- Standard PostgreSQL (local, Neon or another managed provider): identity,
  tenancy, project documents, asset metadata, subscriptions and render job state.
- S3-compatible private object storage (R2 first): original assets and outputs,
  reached through short-lived signed operations.
- Stripe Checkout + Customer Portal: recurring billing. Webhooks are signature
  verified, idempotent and the only source of subscription state.
- Durable Postgres-backed queues behind narrow ports. Render work and private
  object cleanup use atomic `SKIP LOCKED` claims, expiring leases, fencing
  attempts and deterministic retry/backoff.

The local deployment mode and the commercial plan are separate concepts.
`DeploymentMode = local | hosted`; hosted entitlements are `free | creator |
studio`. Local rendering is never nerfed or watermarked by hosted pricing.

## Pricing contract

- **Free hosted**: local editing/export remains available; limited cloud sync;
  free hosted/public exports carry a small Typelapse mark.
- **Creator**: one seat, cloud assets/projects, brand kit, premium motion,
  watermark removal and a monthly hosted-render allowance.
- **Studio (later)**: multiple seats, shared workspaces, higher limits, priority
  jobs, batch variants and agent/API access. It is not sold until invitations,
  roles, seat reconciliation and workspace administration are complete.

Price amounts and allowances are configuration, not domain constants. The first
paid cut is Creator monthly/annual. Hosted render limits and price are finalized
only after code+image and video/audio cost telemetry exists; defer metered
overage until real usage data.

## Portable project contract

- A JSON document contains metadata and asset references only. Exporting it with
  unresolved local media yields an explicit `assets-not-included` warning; it is
  never presented as a self-contained backup.
- A portable `.typelapse` package is a ZIP-compatible archive containing a
  versioned manifest plus checksummed asset files. Import validates the whole
  manifest and limits before mutation.
- Existing code-only JSON exports and hash share links remain supported.

## Security invariants

- Every project, asset and render query is scoped by workspace membership.
- Object keys are generated server-side; MIME, byte size and checksum are
  verified before an asset becomes usable.
- Checkout price lookup is server-owned; clients cannot submit a price ID.
- Webhook raw bodies are verified before parsing and event IDs are unique.
- Render submission is authenticated, quota/rate limited and idempotent.
- Workers lease jobs, retry safely and write deterministic output keys.
- Anonymous synchronous Remotion/FFmpeg compute is disabled in hosted mode.
- Remote rendering is always an explicit user action. Local encoder failure may
  offer the cloud path but never uploads a project automatically.
- Hosted render submission accepts `{projectId, revision, renderOptions}` only.
  The server reloads the canonical revision, verifies every ready owned asset,
  then compiles with a recorded compiler version. Idempotency and output keys
  include workspace, project revision, options and compiler version.
- Untrusted SVG/HTML are refused in the first cut. Media is quarantined until
  byte size, magic bytes, MIME, dimensions/duration and checksum are verified.
- Render workers run non-root with bounded CPU, memory, wall time and temporary
  disk; their network is limited to required object storage and database paths.
