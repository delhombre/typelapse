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
- **Blank scene**: a scene with no code card (no primary code block). It
  still has its duration, transition, caption, text and media layers; a title
  card is a blank scene with a text layer. No renderer draws a card on it, and
  through a transition the neighbouring scene's card fades in or out where it
  stands instead of morphing out of nothing.
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
  the same import has the same fingerprint (and the same scene and step IDs).
  Code-only V2 can roll back to V1.
- **Project file**: what "Export project file" writes and "Open project
  file" reads: the V2 document, code-only projects included, media named by
  metadata and never embedded. An asset whose bytes this browser lacks opens
  in its "Media unavailable" state. V1 files still open through the migration.
- **Revision**: one persisted version of a hosted project; updates are
  optimistic (`409` on a stale revision).

## Legacy code model (V1)

- **Snippet**: a code sample with language and theme.
- **Step**: one state of the code with a hold duration, focus ranges and a
  caption. Steps are the units the **magic move** morphs between. Each step
  is the studio's handle on one scene (same id). A step with empty code is a
  **blank step**: its scene is a blank scene, and the magic move holds the
  nearest captured code there so the card has something still to fade.
- **Live code**: what the code editor holds, never empty. Capture turns it
  into a step; with no step at all it is the one scene the studio shows.
- **Magic move**: the pure, dependency-free token-morphing engine
  (`src/application/magic-move`) shared by every renderer.

## Renderers

Three renderers draw the same picture, and WYSIWYG is a discipline:

- **DOM preview**: the live studio preview (React).
- **Remotion composition**: the server renderer, importing the same React
  surfaces; the only path that bakes captions and synthesized audio today.
- **Canvas painter**: the independent 2D-canvas painter behind on-device
  WebCodecs export (`src/application/frame-painter`). It paints the code card
  and the text, image and video layers from the same scene compiler the other
  two read; layers authored before the card go under it, the rest over it
  (**composition slot**). A video layer shows the source frame at or before
  its `sourceTimeMs`, decoded in the worker; Device refuses, in one sentence,
  a video it cannot read or decode.
- **Readable floor**: the smallest code text a card is drawn at, 8 px on a
  1080p canvas and growing with the tier (`MIN_TEXT_PX` in `canvas-fit`).
  Below it the card stops shrinking and the window clips its code, with a
  fade on each clipped edge (`clipFades`).
- **Plan window**: the rows and columns a card can show at the readable floor
  on any shipped canvas, plus a margin (`VISIBLE_ROW_LIMIT`,
  `VISIBLE_COL_LIMIT`). The magic-move plan lays out nothing past it. On a file
  longer than the window, each step's window starts a few rows above its focus
  band, else above the first line it changes against its neighbour, else at
  the top; a step that changes nothing keeps the window where it was
  (`magic-move/window`). The three renderers scroll between windows on the
  morph's easing; a file that fits the window never scrolls.

Shared math lives in `src/application`. A visual feature lands in all three
or it does not land.

## Export

- **On-device export**: WebCodecs in a worker, MP4 (H.264), WebM (codec
  **ladder**: AV1 4:4:4, AV1, VP9, VP8, probed at run time), GIF (gifenc).
  Never falls back to the server silently.
- **Rung**: one codec candidate on a ladder, with its codec string and chroma.
- **Server render**: `POST /api/render` (V1) and the local multimedia render
  route (V2 with multipart assets), local deployment mode only.
- **Headless render**: `typelapse render <pr-url|commit-url|release-url|diff|project.json>`
  (`cli/`), the server render driven in process with the studio's defaults.
  A PR becomes the project the studio's own import would build
  (`application/import/diff-project`). Engine for the GitHub Action and the
  agent skill; exit codes 0, 2 (arguments), 3 (source), 4 (render).
- **Changelog video**: what a release link (`/releases/tag/<tag>`) or a
  compare link (`/compare/<a>...<b>`) becomes, in the CLI, the Action and the
  studio's link import. The range runs from the previous tag in the
  repository's tag order (or from the first commit) to the tag, chaptered by
  commit like a multi-commit pull request, merges left out; it opens on the
  **release card**, a blank scene with the release title as a text layer and
  the body's opening line under it when that is one short sentence
  (`application/import/release-project`).
- **Hosted render job**: a queued, leased, fenced job on a canonical revision,
  entitlement-gated, with expiring result access.
- **Where**: the export panel's choice of machine. **Device** (WebCodecs in
  this tab), **Server** (the local Remotion routes) and, in a hosted build for
  a signed-in account only, **Cloud**: Render saves the canonical revision
  through the account island's cloud save, then submits a hosted render job.
  The browser keeps nothing but the job id; status, the signed download and
  every refusal (the 402 that names the plan, the grace period's end) come
  from the server in its own sentence. A plan without hosted renders uploads
  nothing.
- **GIF concessions**: the size and frame-rate caps a GIF gets, computed by
  the same functions on the client and the server, and said out loud in the
  export note.
- **Playback clock**: the one duration the playhead, the readout, the ruler
  and the export share (`src/application/studio-timeline/playback.ts`): the
  scenes and their morphs, the loop morph where the export adds it, then the
  last frame held until the audio ends (`compileSceneTimeline`).
- **Playable project**: one scene or more, or authored media without a scene
  (audio alone). Play and Render ask this one question.
- **Frame rate**: 24, 30 or 60, chosen in the export panel and carried by the
  project file (`fps`; absent means 60).

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
- **Ceiling**: a hosted limit carried by the Plan (cloud projects, media
  bytes, hosted render minutes per UTC month, concurrent render jobs). A
  refusal names the ceiling, its value, the usage and the plan that lifts it.
- **Allowance**: the one sentence the server writes about an account's
  ceilings and usage; the account island shows it verbatim.
- **Grace period**: how long past hosted outputs stay downloadable once the
  plan no longer covers hosted rendering (30 days from the later of the render
  and the downgrade).
- **Public render page**: `/v/<id>`, the API's own HTML page for a succeeded
  Cloud render whose owner turned its public flag on (every render starts
  private). It lives while the owner's plan keeps the output; anything else is
  the same 404. Its video and poster addresses re-sign a one-hour object URL on
  each request, so making it private takes effect at once.
- **The rule that settles pricing edge cases**: what runs on the user's
  machine is free and stays free; what runs on our servers is paid.

## Studio vocabulary

- **Scene shell** and **island**: the studio layout doctrine. The frame sits
  on the paper; the controls live in the island.
- **Account island**: the part of the island that carries sign-in, cloud save
  (behind an explicit upload consent) and billing in a hosted build. Absent in
  a local build.
- **Local project**: one entry of the on-device library behind the project
  chip, with its own id. Its V2 document (layers, media, audio cues) is stored
  in IndexedDB under that id; its code spine is also kept in localStorage.
  Switching saves the project being left before the next one loads. A link
  that carries content (`#import=`, `#share=`) on a fresh load opens in a new
  local project, named by what it imports; the open one is left as it was.
  A reload keeps every scene id: the code spine takes the stored ones.
- **Autosave**: IndexedDB persistence of the open local project's V2 document,
  keyed by its id; no destructive action waits for a toast to disappear.
- **Project history**: the one undo and redo of the open local project. Each
  entry is a whole project document, so every edit is covered (code, scene
  durations, order, settings, layers, audio cues, a file opened over the
  project) and going back is loading a document. Kept per local project and
  across reloads. A text field and the code editor keep their own undo while
  they have focus.
- **Edit burst**: edits to the same values within a second (typing, dragging a
  layer, scrubbing a number) are one history entry. Adding or removing a scene,
  a layer or a cue is always an entry of its own.

## Invariants worth a test

- A V1 import twice yields the same fingerprint.
- Preview duration equals export duration equals the sum of scene durations
  plus transitions (plus audio-only tail).
- Nothing uploads before the user consents; local mode makes no account calls.
- The export note never promises what the file does not contain.
- Undo then redo returns the exact project document; an undo never resets the
  unsaved-work baseline, and the composition shows the timeline's scene.
- The three renderers size the card with `fitCardToCanvas` from the shared
  placement table and the measured advance (`measureCharWidthRatio`), never a
  nominal one, and paint the mesh at the timeline's time. They hold the text
  at the readable floor and clip the same window with the same fades.
