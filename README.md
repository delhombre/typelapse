# Typelapse

Open-source animated code snippet videos. Create beautiful step-by-step code animations and export to WebM (MP4/GIF coming soon).

## Stack

- **Vite + React 19 + TypeScript**
- **Shiki** — syntax highlighting (VS Code engine)
- **Motion** — spring-based animations
- **html-to-image + Canvas MediaRecorder** — browser-native video export
- **Tailwind CSS v4** — styling

## Architecture

Clean Architecture with Hexagonal (Ports & Adapters) pattern:

```
src/
├── domain/          # Pure entities, value objects, ports (zero deps)
├── application/     # Use cases and orchestration
├── infrastructure/  # Adapters (Shiki, canvas renderer, export)
└── presentation/    # React UI layer
```

## Quick Start

```bash
pnpm install
pnpm dev        # start dev server
pnpm test       # run tests
pnpm build      # production build
```

## License

MIT
