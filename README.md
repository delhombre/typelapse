<p align="center">
	<img src="public/favicon.svg" width="72" alt="Typelapse" />
</p>

# Typelapse

A scene-first multimedia motion studio for text, code, images, video and audio.
Use every medium on its own or compose them into launch videos, walkthroughs,
social clips and code stories. Diffs and pull requests are structured inputs,
not the product boundary.

Typelapse has two honest deployment profiles:

- **On-device:** no account, browser persistence and local video rendering.
- **Hosted:** private projects and media, Better Auth sessions, Stripe billing
  and queued background rendering.

## Try the on-device studio

```bash
pnpm install
pnpm dev          # UI at http://localhost:5173
pnpm dev:server   # local render API at http://localhost:3001
```

Open `/app`. The default profile keeps the project and imported media on this
device. Exporting a `.typelapse.json` file preserves the editable document, but
does not pretend to embed original media bytes.

## What is implemented

- One ordered scene timeline with text, code, image and video layers.
- Global audio cues with trim, timing, gain and fades.
- Layer placement, crop, focal point, radius, playback rate, mute and z-order.
- Scene duration, transitions, reorder, scrub, undo and redo.
- Shared scene compiler for the DOM preview and Remotion renderer.
- Real local MP4/WebM rendering from the current multimedia document.
- IndexedDB autosave and an editable V2 project document.
- Optional diff, PR, commit and code-file imports.
- Hosted owner-scoped project CRUD with optimistic revisions.
- Private R2 media upload/finalization with MIME, size and SHA-256 verification.
- Better Auth email/password sessions.
- Stripe monthly/annual Checkout, Customer Portal and signed webhook projection.
- Postgres-backed render and object-deletion workers with leased retries.

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
