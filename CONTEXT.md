# Typelapse: glossary and invariants

The product is a **scene-first multimedia motion studio**. A pull request is
one optional source among others, not the product boundary. The contract that
governs the model is `goals/multimedia-saas/contract.md`; this file names the
terms so issues, specs, tests and code use the same ones.

## Content model (V2)

- **Project**: the editable document. Owns canvas settings, theme, brand kit,
  asset metadata, an ordered list of scenes and a list of audio cues. A project
  may be text-only, code-only, image-only, video-only or audio-only.
- **Scene**: one entry of the ordered visual timeline. Has a duration, an
  optional outgoing **transition** and an optional caption. A scene may be
  empty.
- **Block**: one z-ordered layer inside a scene. Four kinds: **TextBlock**,
  **CodeBlock**, **ImageBlock**, **VideoBlock**. Placement, crop, focal point,
  radius, playback rate and mute live on the block.
- **AudioCue**: a global, time-based sound on the audio track, independent of
  scenes, with trim, gain and fades. Audio cues are content, not blocks.
- **Asset**: media metadata (kind, MIME, size, SHA-256, intrinsic size).
  Bytes live behind the **AssetContentPort** (IndexedDB locally, private R2
  when hosted). A project document references assets and never embeds bytes.
- **Project document**: the versioned serialized form. **V1** is the legacy
  code-only shape (`Snippet`, `Step`); **V2** is the canonical multimedia
  shape with stable IDs. V1 imports migrate to V2 with deterministic IDs, so
  the same import has the same fingerprint. Code-only V2 can roll back to V1.
- **Revision**: one persisted version of a hosted project; updates are
  optimistic (`409` on a stale revision).

## Legacy code model (V1)

- **Snippet**: a code sample with language and theme.
- **Step**: one state of the code with a hold duration, focus ranges and a
  caption. Steps are the units the **magic move** morphs between.
- **Magic move**: the pure, dependency-free token-morphing engine
  (`src/application/magic-move`) shared by every renderer.

## Renderers

Three renderers draw the same picture, and WYSIWYG is a discipline:

- **DOM preview**: the live studio preview (React).
- **Remotion composition**: the server renderer, importing the same React
  surfaces; the only path that bakes captions and synthesized audio today.
- **Canvas painter**: the independent 2D-canvas painter behind on-device
  WebCodecs export (`src/application/frame-painter`).

Shared math lives in `src/application`. A visual feature lands in all three
or it does not land.

## Export

- **On-device export**: WebCodecs in a worker, MP4 (H.264), WebM (codec
  **ladder**: AV1 4:4:4, AV1, VP9, VP8, probed at run time), GIF (gifenc).
  Never falls back to the server silently.
- **Rung**: one codec candidate on a ladder, with its codec string and chroma.
- **Server render**: `POST /api/render` (V1) and the local multimedia render
  route (V2 with multipart assets), local deployment mode only.
- **Hosted render job**: a queued, leased, fenced job on a canonical revision,
  entitlement-gated, with expiring result access.
- **GIF concessions**: the size and frame-rate caps a GIF gets, computed by
  the same functions on the client and the server, and said out loud in the
  export note.

## Deployment and commerce

- **Deployment mode**: `local` (account-free studio, synchronous render
  routes) or `hosted` (private projects and media, auth, billing, queued
  rendering; anonymous synchronous compute is disabled). Separate from
  entitlement.
- **Capability**: a hosted feature the API can mount (`auth`, `projectSync`,
  `privateAssets`, `billing`, `hostedRendering`). Each fails closed when its
  configuration is absent; `pnpm hosted:check` lists what is missing.
- **Plan**: `free` or `creator` (paid). Resolved server-side from the Stripe
  projection; never from a header or a body field.
- **The rule that settles pricing edge cases**: what runs on the user's
  machine is free and stays free; what runs on our servers is paid.

## Studio vocabulary

- **Scene shell** and **island**: the studio layout doctrine. The frame sits
  on the paper; the controls live in the island.
- **Account island**: the part of the island that carries sign-in, cloud save
  (behind an explicit upload consent) and billing in a hosted build. Absent in
  a local build.
- **Autosave**: IndexedDB persistence of the current project; no destructive
  action waits for a toast to disappear.

## Invariants worth a test

- A V1 import twice yields the same fingerprint.
- Preview duration equals export duration equals the sum of scene durations
  plus transitions (plus audio-only tail).
- Nothing uploads before the user consents; local mode makes no account calls.
- The export note never promises what the file does not contain.
