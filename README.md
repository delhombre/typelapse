<p align="center">
	<img src="public/favicon.svg" width="72" />
</p>

# Typelapse

A timelapse for your code: morph snippets into MP4, WebM and GIF, token by token.

One engine drives both the browser preview and the Remotion render, so the exported video matches the preview frame for frame (WYSIWYG).

<p align="center">
	<img src="docs/demo.gif" width="720" alt="Typelapse rendering its own demo: a snippet morphs token by token, with a spotlight, captions and a typewriter intro" />
</p>

<p align="center"><sub>This demo was rendered by Typelapse itself: <code>POST /api/render</code>, straight from the repo.</sub></p>


## Quickstart

```bash
pnpm install
pnpm dev         # studio at http://localhost:5173
pnpm dev:server  # render API on port 3001
pnpm test        # run the test suite
```

## Features

- Token-level magic move: shared tokens glide, removed tokens fade out, added tokens fade in (not a crossfade).
- Diff walkthroughs: paste a unified diff or a GitHub PR URL; hunks become windowed, captioned steps (lockfiles filtered).
- Spotlight: focus lines per step; the rest dims, crossfading through morphs. Optional cinematic zoom onto the focus.
- Captions: per-step annotations rendered under the frame, cross-dissolving between steps.
- Record mode: type in the editor; a step is captured at every pause.
- Typewriter intro, seamless loop, morph tempo (snappy / smooth / cinematic) and synthesized typing sounds.
- Animated mesh-gradient, solid or uploaded-image backdrops: same clock in preview and render.
- Window chromes: macOS, browser, terminal or none.
- Aspect presets: 16:9, 1:1, 9:16, 4:5 and 3:4 for Reels, Shorts and TikTok.
- Progress styles, line-number start and toggle, 7 themes, 5 monospace fonts.
- Import from a gist or GitHub URL; share links, JSON import/export and PNG snapshot.

## Architecture

Hexagonal (ports and adapters), dependencies pointing inward:

- `src/domain`: pure entities, value objects and ports, zero framework deps.
- `src/application`: the pure magic-move engine, shared by the browser and the server.
- `src/infrastructure`: Shiki adapters implementing the ports.
- `src/presentation`: the React studio.
- `server/`: Hono API and the Remotion composition.

## License

MIT. See [LICENSE](LICENSE).
