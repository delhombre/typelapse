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
  The focus field refuses what it cannot read as this step's lines (`abc`,
  `0`, a reversed `5-2`, a start past the last line) and clamps an end past
  it (`1-99` on five lines is `1-5`); opening a project keeps its focus as
  written, and the clamp to the step's lines is applied where it is drawn.
- **Live code**: what the code editor holds, never empty. Capture turns it
  into a step; with no step at all it is the one scene the studio shows.
- **Fork** (the empty scene list's): what the scene list shows while the project
  has no scene and the editor has code. One primary, "Capture this code", and two
  quiet rows, "Start from an example" (opens the Showcase) and "Import a pull
  request" (opens the source hub's diff view). It is not rendered once a scene
  exists, on the phone sheet and on the desktop panel alike.
- **Continuation scene**: a diff import holds at most `MAX_SCENE_LINES` rows
  in any frame (`application/diff/scenes`), because one card serves every scene
  and the tallest frame sets its size: 56 rows left the code at 9 px in the
  1080p export, 24 leave it at 18.8 (`MIN_READABLE_CODE_PX` is 18). What the
  budget keeps is split into pages, each played on its own (its before-state, its
  hunks applied, its after-state). A window taller than a page is cut, and the
  scene after the cut is a continuation scene: it opens with the `⋯` separator
  (the piece before closes on one) and keeps the caption of the hunk it
  continues. A block of removals and additions is windowed interleaved (r1 a1 r2
  a2), so a cut keeps each old line facing the line that replaces it. A page
  that continues an addition, or opens on nothing but `⋯`, has no opening frame. A
  walkthrough (a diff, or one chapter of a pull request) plays at most
  `MAX_WALKTHROUGH_PAGES` (4) pages, over at most 6 files; the marker line
  (`⋯ n more files` or `⋯ more changes hidden`) says what is left.
  `tests/support/scene-readability` measures the px a plan lands at, with
  the same `fitCardToCanvas` the renderers call. A 9:16 frame is limited by the
  longest line, not the rows (16.7 px for the example PR's 77 columns).
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
- **Line clip**: the floor also sets the most columns any card shows: the
  window width the floor leaves on a canvas whose width is its short edge
  (9:16, 1:1, 4:5, 3:4), 185 columns at the defaults. A longer line is cut at
  that width on every canvas, 16:9 included, never fit: 16:9 used to show
  lines of 186 to about 330 columns whole, above the floor, and now cuts them
  at 185 like the other formats. The cut fades out over the three whole
  columns before it plus the partial column at the edge (`lineClip` in
  `layout/line-clip.ts`, in cells), inside the code column, so it moves with
  the push-in; the window keeps its own right fade for what the push-in
  carries past its edge. The push-in pivots left of centre only as far as
  keeps the gutter at least half the margin inside the window (`zoomOriginX`,
  3 × padding / width at 1.25, at most the centre), and the right edge fades
  over the rest: the window's own fade on a cut line, otherwise one that
  fades in with the push-in (`pushInFade`). The columns come from the widest
  line across every scene, one geometry for the whole video like the caption
  band. The engine still lays the whole line out: a morph glides under the
  cut, and the typewriter types the hidden tail, its caret out of sight past
  the cut.
- **Plan window**: the rows and columns a card can show at the readable floor
  on any shipped canvas, plus a margin (`VISIBLE_ROW_LIMIT`,
  `VISIBLE_COL_LIMIT`). The magic-move plan lays out nothing past it. On a file
  longer than the window, each step's window starts a few rows above its focus
  band, else above the first line it changes against its neighbour, else at
  the top; a step that changes nothing keeps the window where it was
  (`magic-move/window`). The three renderers scroll between windows on the
  morph's easing; a file that fits the window never scrolls.
- **Display cell**: the unit of a column on the magic-move grid, counted the
  way a terminal does (`text/display-width`): a CJK character, a fullwidth
  form or an emoji takes two cells, a combining mark or joiner none,
  everything else one. The engine places tokens by cells; the three renderers
  draw each wide glyph centred on its two cells, so the next token never
  paints over it. Diff edges move onto glyph edges (`whole-glyph-diff`), so a
  morph never cuts an emoji in half.

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
- **Render by URL**: the hosted call that turns a **source** (a pull request,
  commit, release or compare link of a public repository, or a unified diff)
  into a cloud project of the caller and a hosted render job. The importers the
  studio and the headless render use read the source, and the project is the one
  they would build. The caller holds one project for each source: the same
  source sent twice is the same project and the same job, and a source that has
  changed since is a new revision of it. The answer names the job and the
  **studio link** (`/app#import=`, which opens the same import in the studio;
  a diff too long for an address opens the studio empty). A free account gets
  the studio link and the reason there is no job, and nothing is fetched or
  saved. A request over a ceiling creates nothing, and the project it saves
  is an automation project, which the cloud-projects ceiling does not count.
  Its options carry the encode (format, size, rate, loop) and a **theme**, one
  of the studio's, swapped whole by the same function as the CLI's `--theme`
  (`application/project/with-theme`) before the project is saved: the theme is
  part of the project, so another theme for one source is a new revision.
  Its reads of GitHub carry the server's optional token
  (`TYPELAPSE_GITHUB_TOKEN`, fine-grained, public repositories) when there is
  one, and each source is read inside a time budget (30 seconds): the budget
  lives in the import cascade, which stops the fetchers when it is spent.
- **Hosted output** (of the Action): with an API key, the Action asks render by
  URL for the pull request, waits at most ten minutes, publishes the render's
  page itself (a page is private until published, and render by URL reads
  public repositories only) and its one comment links the share page and the
  studio (`cli/hosted-render.ts`). It replaces the runner's render only when it
  ends in a published page; a free account, a refusal, an outage or a GIF
  leaves the runner to render, and the comment says why. A hosted problem never
  fails the job, and a fork, which gets no secrets, renders on the runner.
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
- **Capability**: a hosted feature the API can mount (`auth`, `mail`,
  `projectSync`, `privateAssets`, `billing`, `hostedRendering`, `apiKeys`).
  Each fails closed when its configuration is absent; `pnpm hosted:check` lists
  what is missing. No `mail` means no `auth`: nobody could receive a code.
- **Sign-in code**: the six digits mailed to an address that asks to sign in, the
  one way into an account (no password). One flow for a new address and a known
  one, answered alike so no answer says which exists. Valid ten minutes, three
  tries. Sending is limited per address (ten an hour, twenty a day), per client
  (ten in ten minutes, the client read from `TRUSTED_CLIENT_IP_HEADER` when set) and
  per instance (two hundred an hour).
- **Plan**: `free` or `creator` (paid). Resolved server-side from the Polar
  subscription projection; never from a header or a body field. A plan carries
  hosted entitlements only (hosted renders and their size rectangle, cloud
  projects, media), never anything about an export on the user's machine.
- **Device export**: an export rendered on the user's own machine (the browser
  encoder, or their local Remotion server). Plan-independent: no plan clamps its
  size, rate or length, and Typelapse never stamps a watermark on it. The
  **watermark** is the user's own text, or nothing.
- **Billing environment**: `sandbox` or `production`, read by the server from
  `POLAR_ENVIRONMENT` and published as `environment` on `/api/billing/catalog`.
  The client never infers it from the build. Only `sandbox` draws the **test mode
  line** ("Test mode: no real charges") beside the plan card; production, an
  older server and an unset variable draw nothing.
- **Ceiling**: a hosted limit carried by the Plan (cloud projects, media
  bytes, hosted render minutes per UTC month, concurrent render jobs). A
  refusal names the ceiling, its value, the usage and the plan that lifts it.
- **Regular project** and **automation project**: the two kinds of cloud
  project. A regular project is one a person has saved from the studio, and
  the cloud-projects ceiling counts it. An automation project is one only
  render by URL has written, one for each account and source; the ceiling
  does not count it, so a busy repository cannot lock its owner out. A save
  from the studio makes it regular and from then on it counts, and that save
  is refused, like a new project, when the account is already at the ceiling.
  Nothing deletes an automation project for being one.
- **Delete a cloud project**: what the account island's Cloud projects view
  offers on each project, behind the shared confirmation. It takes the project
  with its media, its render jobs and their public pages; the files they stored
  get a durable note for the object-deletion worker in the same transaction.
  A project with a render still queued or running is kept, and the answer says
  so: the render holds a slot of the account's concurrent renders until it ends,
  and a delete must not free it. The studio never opened the cloud copy, so deleting the open project's copy leaves
  the open local project as it was, on this device, and the next save makes a
  new copy. Only the session may delete, and another account's project answers
  404 like one that does not exist.
- **Usage ledger**: the account's record of the hosted render minutes it has
  spent, one entry for each render job accepted, written with the job and
  released only when the job ends in failure, because a render that produced
  nothing spent nothing. The month's minutes are summed from it, by the
  enforcing queue and by the allowance alike. It belongs to the account, not to
  the project, so deleting a project takes its jobs and leaves their minutes
  spent for the month; renders in flight are counted from the jobs, which a
  delete never takes while they run.
- **Allowance**: the one sentence the server writes about an account's
  ceilings and usage, and the numbers it was built from (the ceilings, the
  usage, the instant the month's minutes reset). The plan card draws a bar and
  a count per quota from the numbers, warns at 90%, and keeps the sentence as
  the screen reader's summary; the client adds no figure of a plan.
- **Checkout return sheet**: the dialog `?billing=success` raises in place of
  a toast. It confirms (the provider's webhook has not landed, so the plan is
  still Free), says what changed once the server reports a paid plan, or says
  only that the payment arrived when twenty seconds pass. A cancelled checkout
  stays a toast.
- **Grace period**: how long past hosted outputs stay downloadable once the
  plan no longer covers hosted rendering (30 days from the later of the render
  and the downgrade).
- **Public render page**: `/v/<id>`, the API's own HTML page for a succeeded
  Cloud render whose owner turned its public flag on (every render starts
  private). It lives while the owner's plan keeps the output; anything else is
  the same 404. Its video and poster addresses re-sign a one-hour object URL on
  each request, so making it private takes effect at once.
- **API key**: a credential an account makes in the account island for a
  script that has no browser. Named, optionally expiring, shown once and kept
  only as a hash, rate limited per key, revoked by deleting it. It stands in
  for the session on the hosted render routes (render by URL included) and on
  nothing else: account, billing, projects, assets and key management accept
  the session alone. The account's plan still decides what a key may start.
- **Key prefix**: the public start of a key (`tlk_` and eight characters). It
  names the key in the island and in a log line and is how the server finds
  it; the secret is the rest, and it is never stored.
- **The rule that settles pricing edge cases**: what runs on the user's
  machine is free and stays free; what runs on our servers is paid.

## Studio vocabulary

- **Scene shell** and **island**: the studio layout doctrine. The frame sits
  on the paper; the controls live in the island.
- **Loupe**: on a phone, the frame magnified until its code reads at 11px.
  A tap grows the live DOM preview over the screen by a transform; it is the
  same picture, still playing, never a copy. Closed by a tap, a pull down,
  Done or Escape (`application/layout/code-loupe.ts`).
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
- **Recovery key**: the localStorage entry (`typelapse:recovery:v1`) the open
  project is set aside under, never deleted, when it cannot be opened: the
  restore refused it, or the studio threw between a restore and the commit
  that follows it and the default project then rendered. There are two
  restores: the code (the draft, on mount) and the composition (layers, media,
  audio cues, read from IndexedDB once the code is on screen); the wait between
  them is not watched. One slot per project id, never evicted; the rest of the
  library stays; the default project (its code, and a composition of that code
  alone) is never kept; a composition that threw and cannot even be read is
  not known to be empty, so it gets a slot. When the composition is what threw, the open project's
  library entry goes whether or not anything was kept, so the fresh project
  never reopens it. When the entry goes, the slot names the IndexedDB key its
  composition and media bytes stay under, untouched (no library entry opens
  that key again, and bytes a stored composition references are never pruned);
  when the entry stays open, it names none, since that project still reads and
  saves it. When the composition that threw holds layers, media or audio, the
  slot also holds it as it was on screen. The studio opens a fresh project and
  says so in one line whose one action, "Download it", saves the kept project
  as a file the studio opens: the V2 document, layers and media by reference,
  when the slot holds it, else the code project. A throw anywhere else moves
  nothing, and a studio that threw writes nothing on its way out.
- **Project history**: the one undo and redo of the open local project. Each
  entry is a whole project document, so every edit is covered (code, scene
  durations, order, settings, layers, audio cues, a file opened over the
  project) and going back is loading a document. Kept per local project and
  across reloads. A text field and the code editor keep their own undo while
  they have focus.
- **Edit burst**: edits to the same values within a second (typing, dragging a
  layer, scrubbing a number) are one history entry. Adding or removing a scene,
  a layer or a cue is always an entry of its own.
- **Capture library**: what the Library button opens, a sheet of the
  **captures** this device kept: each finished export (a PNG, GIF, MP4 or WebM
  from the device or the local server) with its project's title, date and size,
  newest first, across local projects, at most 24 and 150 MB. A capture here is
  a kept export, not the step builder's Capture, which turns live code into a
  step. On a desktop the sheet is as wide as its captures (one to three
  columns); its empty state says what a capture is and opens the export panel.

## Invariants worth a test

- A V1 import twice yields the same fingerprint.
- Preview duration equals export duration equals the sum of scene durations
  plus transitions (plus audio-only tail).
- Nothing uploads before the user consents; local mode makes no account calls.
- A key opens the hosted render routes and nothing else; a request with a valid
  session and a key is the session's; a key that is unknown, revoked or expired
  is refused with one answer, whichever it is.
- A key never leaves the Authorization header of a request to the address the
  workflow named: not a URL, an argument, a file, a log line or a comment.
- A source rendered by URL twice is one project and one job; a request refused
  for a ceiling, a size or a source that cannot be read leaves no project and no
  job behind.
- Render by URL reads public repositories only, with or without a token on the
  server: a repository whose own record does not say it is public is refused in
  the words a missing one gets, before the token reads any of it.
- The cloud-projects ceiling counts regular projects: an account at it still
  renders a new source by URL, and the studio's save of one project more, a
  new one or an automation project made regular, is refused.
- A deleted cloud project leaves no row of its own (media, render jobs, public
  page) and no render job a worker could still finish; every file it stored is
  noted for deletion, and the open local project is untouched.
- The month's hosted minutes survive deleting the project that produced them:
  render, delete, render again meets the same ceiling, and the allowance
  sentence reads the same number before and after (the project count is the one
  figure that moves). A render that ends in failure returns its minutes, and
  nothing else does.
- The export note never promises what the file does not contain.
- Undo then redo returns the exact project document; an undo never resets the
  unsaved-work baseline, and the composition shows the timeline's scene.
- The three renderers size the card with `fitCardToCanvas` from the shared
  placement table and the measured advance (`measureCharWidthRatio`), never a
  nominal one, and paint the mesh at the timeline's time. They hold the text
  at the readable floor and clip the same window with the same fades.
