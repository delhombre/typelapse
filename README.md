<p align="center">
	<img src="public/favicon.svg" width="72" alt="Typelapse" />
</p>

# Typelapse

Code videos as sharp as their preview, made in your browser from a pull
request, a diff or a snippet. The WebM export keeps every colour sample on
every glyph (AV1 4:4:4), measured against H.264 4:2:0 on the same frame in
[`docs/sharpness`](docs/sharpness/sharpness.json). On-device, it needs no
account and uploads nothing. Underneath is a scene-first multimedia motion
studio: text, code, images, video and audio share the same scenes, on their own
or composed into launch videos, walkthroughs and social clips.

Typelapse has two honest deployment profiles:

- **On-device:** no account, browser persistence and local video rendering.
- **Hosted:** private projects and media, Better Auth sessions, Stripe billing
  and queued background rendering.

<p align="center">
	<img src="docs/demo.gif" width="720" height="540" alt="Typelapse rendering its own demo: a snippet morphs token by token, with a spotlight, captions and a typewriter intro" />
</p>

<p align="center"><sub>Rendered by Typelapse itself, from a project committed next to it: <code>pnpm demo:render</code> replays <a href="docs/demo.project.json"><code>docs/demo.project.json</code></a> through <code>POST /api/render</code>.</sub></p>

## Try the on-device studio

```bash
pnpm install
pnpm dev          # UI at http://localhost:5173
pnpm dev:server   # local render API at http://localhost:3001
```

Open `/app`. The default profile keeps the project and imported media on this
device. Exporting a `.typelapse.json` file preserves the editable document, but
does not pretend to embed original media bytes.

## Render from the command line

```bash
pnpm typelapse render https://github.com/octocat/Hello-World/pull/1
pnpm typelapse render change.diff --format gif --out change.gif
pnpm typelapse render docs/demo.project.json --size 1280x720 --fps 30 --json
git diff | pnpm typelapse render - --open
```

The source is a pull request URL, a commit URL, a unified diff file (`-` reads
stdin) or a project exported from the studio. A project with text layers and no
media renders as MP4 or WebM through the same V2 composition as the studio's
server export; the launch clip is one (`docs/launch/launch.project.json`). The CLI drives the same render
route and the same defaults as the studio's export, on this machine and with no
account: MP4 at 1920x1080 and 60 fps unless the project or a flag says
otherwise. Flags: `--format mp4|webm|gif`, `--size WxH` (even edges),
`--fps 24|30|60`, `--theme <name>`, `--out <path>`, `--loop`/`--no-loop`
(a GIF loops by default), `--open` (also print a studio link that opens the same
project; set the studio with `--studio-url` or `TYPELAPSE_STUDIO_URL`) and
`--json` (one line: `path`, `bytes`, `width`, `height`, `fps`, `durationMs`,
`codec`, read back from the file). `GITHUB_TOKEN` reads private repositories
and lifts GitHub's rate limit.

stdout carries only the result; progress goes to stderr. Exit codes: `0` the
file was written, `2` bad arguments or a bad file, `3` GitHub could not serve
the source (private, missing, rate-limited, offline), `4` the render failed.
Every error is one sentence.

## Render every pull request

```yaml
# .github/workflows/render-pr.yml
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: delhombre/typelapse@main
```

The action runs the CLI above on the runner, uploads the video as an artifact
(unzipped, so the link downloads the file itself) and posts one comment with the
measured size, rate, length and codec plus a link that opens the pull request in
the studio. Each push edits that comment instead of adding one. No secret is
needed: the workflow's own token reads the pull request. Remotion's headless
browser and the pnpm store are cached between runs.

Inputs, all optional: `source` (defaults to the pull request that triggered the
run; a commit URL works on a push or a release), `format`, `size`, `fps` and
`theme` (the CLI's flags), `studio-url` (the studio the link opens; empty links
a local one at `http://localhost:5173/app`), `comment` (`false` writes the job
summary only) and `github-token`. Outputs: `path`, `studio-url`,
`artifact-url` and `exit-code`. A pull request from a fork runs with a read-only
token, so its link lands in the job summary instead of a comment. This
repository runs the action on its own pull requests
([`.github/workflows/render-pr.yml`](.github/workflows/render-pr.yml)).

## Let an agent render it

```bash
npx skills add delhombre/typelapse --skill typelapse-pr-to-video
```

Then ask for a pull request as a video, in one prompt. The skill runs the same
CLI and answers with the file and the studio link; see
[`skills/typelapse-pr-to-video`](skills/typelapse-pr-to-video/README.md).

## What is implemented

- One studio at `/app`: `ResponsiveShell` (editor, scene inspector, step
  builder, live preview and timeline) over `StudioCompositionBridge`, so the
  code steps and the composition (text, code, image and video layers, global
  audio cues) are one V2 project.
- Global audio cues with trim, timing, gain and fades.
- Layer fit, focal point, radius, playback rate, mute and order.
- Scene duration, transitions, reorder, scrub, undo and redo, on one playback
  clock that the readout, the ruler and the export share.
- Three renderers on shared math: the DOM preview, the Remotion composition and
  the Canvas painter, sizing the card from the same measured width.
- On-device export with WebCodecs (MP4, WebM up to AV1 4:4:4, GIF) at 24, 30 or
  60 fps, and a local server render of the same V2 document.
- A local project library in IndexedDB with autosave. The project file saves
  and opens the whole V2 document, naming media without embedding it.
- Optional diff, PR, commit and code-file imports.
- Headless render: the `typelapse` CLI, the GitHub Action and the agent skill.
- Hosted owner-scoped project CRUD with optimistic revisions.
- Private R2 media upload/finalization with MIME, size and SHA-256 verification.
- Better Auth email/password sessions in the hosted account island.
- Stripe monthly/annual Checkout, Customer Portal and signed webhook projection.
- Postgres-backed render and object-deletion workers with leased retries. In a
  hosted build, a signed-in account renders on them from the export panel's
  Cloud choice under Where.

## Hosted profile

The hosted profile is a real backend, not a simulated paid mode. It fails closed
until every required adapter is configured.

1. Copy `.env.example` to `.env` and select `TYPELAPSE_DEPLOYMENT_MODE=hosted`.
2. Configure PostgreSQL (local, Neon or another managed provider), Better Auth,
   a private R2 bucket and Stripe test or live credentials.
3. Apply the versioned schema:

   ```bash
   pnpm db:migrate
   ```

4. Verify that the API can mount every commercial capability without printing
   secrets:

   ```bash
   pnpm hosted:check
   ```

5. Run the API and workers as separate processes:

   ```bash
   pnpm dev:server
   pnpm worker:render
   pnpm worker:object-deletion
   ```

`GET /health` is the runtime source of truth for `auth`, `projectSync`,
`privateAssets`, `billing` and `hostedRendering`. Anonymous synchronous Remotion
compute is never mounted in hosted mode.

### Browser configuration

Build the frontend with:

```dotenv
VITE_TYPELAPSE_DEPLOYMENT_MODE=hosted
VITE_TYPELAPSE_AUTH_ENABLED=true
# Omit for same-origin /api/auth, or set the absolute API origin.
VITE_BETTER_AUTH_URL=https://api.example.com
```

The public pricing UI reads amounts from `/api/billing/catalog`. The server
resolves configured Stripe Price IDs; the browser never submits a Price ID and
signed webhooks remain the only source of paid entitlement.

## Deployment

Two addresses are not known until the studio is deployed:

- `TYPELAPSE_APP_URL`, the studio's public URL, is read at build time: `vite
  build` writes it into the `og:image` and `twitter:image` tags, since crawlers
  ignore a relative share image. Without it the build still succeeds, warns and
  points them at `http://localhost:5173`. The hosted API reads the same variable
  for the Stripe return URLs.
- `TYPELAPSE_STUDIO_URL` is a repository variable (Settings, Secrets and
  variables, Actions, Variables). The render workflow passes it as `studio-url`,
  so the pull request comment links the deployed studio; left empty, the link
  opens a local one. The CLI reads the same name from the environment.

## Business model encoded in the product

- **On-device:** the complete local editor, accountless and not artificially
  limited by a hosted plan.
- **Hosted Free:** private continuity and limited hosted service; no cloud video
  render entitlement.
- **Creator:** one seat, private cloud projects/assets and hosted 4K rendering,
  sold monthly or annually through Stripe.
- **Studio:** deliberately not sold until shared workspaces, roles and seat
  reconciliation exist.

Exact prices live in Stripe. The landing page shows no invented amount when the
hosted catalog is absent.

## Architecture

The codebase follows a hexagonal boundary:

```text
src/domain          immutable entities, value objects and ports
src/application     authoring, compilation, sync and render use cases
src/infrastructure  browser, Shiki, Stripe and HTTP adapters
src/presentation    React studio and landing page
server              Hono composition root, Postgres/R2 adapters and workers
```

The canonical model is `Project → Scene → Block → Asset`, plus global
`AudioCue → Asset` references. Runtime URLs and signed storage access never enter
the serialized document.

## Quality gates

```bash
pnpm test
pnpm check-types
pnpm typecheck:server
pnpm lint
pnpm build
```

## License

MIT. See [LICENSE](LICENSE).
