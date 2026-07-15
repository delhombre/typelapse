<p align="center">
	<img src="public/favicon.svg" width="72" />
</p>

# Typelapse

A timelapse for your code — morph snippets into MP4, WebM and GIF, token by token.

One engine drives both the browser preview and the Remotion render, so the exported video matches the preview frame for frame (WYSIWYG).

## Quickstart

```bash
pnpm install
pnpm dev         # studio at http://localhost:5173
pnpm dev:server  # render API on port 3001
pnpm test        # run the test suite
```

## Features

- Token-level magic move — shared tokens glide, removed tokens fade out, added tokens fade in (not a crossfade).
- Animated mesh-gradient backgrounds, driven by the same clock in preview and render.
- Aspect presets — 16:9, 1:1, 9:16, 4:5 and 3:4 for Reels, Shorts and TikTok.
- Typewriter intro — the first step types itself out, character by character.
- Seamless loop — a last-to-first morph is appended so the player never hard-cuts.
- Progress styles — reels segments, a bar, or none.
- 7 themes and 5 monospace fonts.
- Share links, JSON import/export and PNG snapshot.

## Architecture

Hexagonal (ports and adapters), dependencies pointing inward:

- `src/domain` — pure entities, value objects and ports, zero framework deps.
- `src/application` — the pure magic-move engine, shared by the browser and the server.
- `src/infrastructure` — Shiki adapters implementing the ports.
- `src/presentation` — the React studio.
- `server/` — Hono API and the Remotion composition.

## License

MIT — see [LICENSE](LICENSE).
