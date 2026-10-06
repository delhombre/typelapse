# Design direction

One page the design agents read before any interface work. Short, opinionated, specific. Update it when the product's point of view changes, not for every screen.

## Point of view
A camera for code: the frame on warm paper, the controls in one dark instrument, and nothing else asking for attention. The landing is seen once and may be memorable; the studio is used for an hour and must be quiet. One word a reviewer would use: calm.

## Who uses it
A developer who wants a sharp video of a pull request, a diff or a snippet in minutes, often between two tasks, on a laptop; a phone when sharing from the couch. Patience is short: the first export has to look right without reading anything.

## References (what we borrow, precisely)
- ui.camera: the frame sits on the paper, every control lives in the island, copy is direct.
- Apple HIG: restraint, one material per layer, motion that is physical and interruptible (see the apple-design skill).
- Screen Studio and snipcast are what we beat, not what we borrow: sharper text (AV1 4:4:4), free on the device, no watermark.

## What we refuse
Gradient heroes, glassmorphism on anything that holds text, emoji icons, decorative motion, cold Tailwind neutrals in the studio, a shadow and a border on the same element, em-dashes in copy, marketing numbers the product cannot prove.

## Motion
Restrained and functional. Springs from `src/presentation/motion.ts` and the studio's island spring (critically damped); durations and curves are written as values in the pass files, never as adjectives. Reduced motion keeps colour fades and drops movement. The landing's instrument is the one demonstrative piece.

## Tokens and sources of truth
`docs/design/SYSTEM.md` (every token quoted from the file that ships it, checked by `tests/docs/design-system.test.ts`), `docs/design/DECISIONS.md` (the doctrine, D-numbered), `src/app.css` and `src/presentation/studio-camera.css` (role tokens `--color-*`, `--camera-*`, `--r-*`), `docs/design/passes/` (one file per screen pass). Three renderers draw the same frame: a visual change lands in the DOM preview, the Remotion composition and the Canvas painter, or it does not land.

## Screenshots
Before and after shots of every pass live in the pass files' scratch folders; the ones worth keeping go to `docs/design/refs/`.
