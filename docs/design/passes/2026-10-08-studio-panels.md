# Pass: studio panels and tools, 2026-10-08

## Screen

`/app`, both shells: the island's four-cluster sheet and the desktop rail's export mode, the scene list and inspector, the status row, toasts, Monaco, the source hub's popovers, the social row, the showcase, the timeline's disabled controls. Files: `src/presentation/components/controls/` (`cluster-panels.tsx`, `studio-cluster-mode.tsx`, `export-status.tsx`, `preview-island.tsx`), `components/editor/` (`step-builder.tsx`, `code-editor.tsx`), `components/ui/notice-host.tsx`, `components/layout/` (`studio-source-hub.tsx`, `url-import-menu.tsx`, `diff-import-menu.tsx`, `source-error.tsx`), `src/app.css`, `src/presentation/studio-camera.css`. Out of scope, owned elsewhere: the corner row, the account island, the phone sheet's geometry (`phone-sheet.ts`, `mobile-shell.tsx`), the code loupe, `ImportStatus`, the landing.

## Before

`.craft/evidence/2026-10-08-panels-fix/before/` (git-ignored): 66 measurement keys and a screenshot per state at 390 and 1440, light and dark. The audit folder `studio-panels/` named in the brief no longer exists, so the harness is `audit.mjs` there (hit boxes by `elementFromPoint`, contrast with opacity composited). Measured: Render disabled at `opacity: 0.55` over the plate, 2.14:1; Undo and the transport at `.32`, 1.5 to 1.8:1; Capture at `.4`, 1.7 to 2.2:1; showcase "Open" at `.62`, 2.5:1 on the desktop; the desktop rail's disabled Render `#8e8c95`, 4.48:1; phone sheet controls 26 to 56px wide by 26 to 41px tall; toast Dismiss 2.58:1 and 40px; Monaco background `#0a0a0a`, line numbers 1.8:1, the iPad keyboard button present; the scene list's editor at 2515px down the phone sheet at twenty scenes.

## Decisions

- `emil-design-foundations` (color 14): `--camera-disabled` light `#726f68`, dark `#958f87`, restated as `--dock-disabled #8e8e96` inside the island, the sheet and the status. Every opacity-as-state rule is a colour now (Capture, Add scene, transport, Undo and Redo, layer strip, source choice, capture card). SYSTEM.md Colour rows and DECISIONS D16.
- `emil-forms-and-inputs`: Render with nothing to render is a flat 8% wash in the disabled ink plus a visible note and a Capture shortcut (`render-block.ts`, `RenderNotes`): a `si-cluster-note` in the phone's sheet, a pill above the rail on the desktop. Busy is `aria-busy`, full colour and `cursor: progress`, one progress (the status row). The phone sheet had none of the desktop's busy and disabled rules; they live in `app.css` for both shells now.
- `emil-touch-and-accessibility`, `emil-mobile-native`: under `@media (pointer: coarse)` the sheet's chips, swatches, tabs, close, fields and Render are drawn 44px with the row's `::after` reach switched off; the phone's social row joins the 44px cells with no gap; the status row, notices, the scene Undo chip and "+ New project" take the step. A sticky footer keeps Render and its notes in the sheet's capped room. DECISIONS D17.
- `emil-surfaces`, `emil-color`: toasts on `--camera-surface` and `--camera-raised`, no blur, no border, concentric 8px tile, `--z-notice` from a named scale; the status row on `--r-sheet`; Monaco themes derived from the warm tokens (`monaco-theme.ts`, tests read the CSS), `wordWrap: "on"`, `.iPadShowKeyboard` hidden; five static backdrops cut from the meshes' own ramps.
- `emil-animations`, `emil-ui-polish`: the scene list is on tokens and classes; one entrance for an added row (`opacity` and 6px of `y`, `springs.snappy`), none on mount, none for rows behind "Show all", `{ duration: 0 }` with a fade under reduced motion, no blur; one ellipsis on the preview; hidden `<label>`s on the row fields; placeholders in `--camera-muted`; `scroll-margin-top: 12px` and a scroll back to the head after a delete; Recording on `--camera-danger` (label, dot, 8% wash).
- `emil-typography`: states and prose at 12px (`.si-status`, `.si-cluster-note`, the source error), 16px fields under a finger.
- Phone scene list, twenty scenes: collapsed to a window of three rows plus "Show all 20 scenes", chosen over reordering because `mobile-shell.tsx` is out of scope. The editor starts 1200px down instead of 2515px.
- Copy (D13): gist 404 "That gist was not found. Check the link or that it is public."; PR, commit, release and comparison not found gain "Check the link, or paste the diff." and an icon, at the popover only (the adapters' sentences are pinned by the CLI and the API); "Saved <name>, 5.3 MB, in 12.4s on this device." is one sentence for the eye and the screen reader (`savedTail`); the filename wraps; GIF frame-rate and captions-not-baked are said before Render; the empty state no longer says "above".
- Label in Name: the source menu's `aria-label` rewrites are gone, the name comes from `aria-labelledby` on the visible word and the detail is its description.
- LinkedIn greyed beside the vertical feeds with "1:1 or 4:5" (`lockedFeeds`), hidden under 640px where the row is the whole screen.
- SYSTEM.md corrected: `--color-on-primary` 9.92:1 (white 1.73:1), `--camera-danger` 4.94:1. Length caps of the doc test raised to 260 and 345 lines for the new rows and decisions.

## After

`.craft/evidence/2026-10-08-panels-fix/after/` and `measurements.json`. Box sizes in the sheet at 390: 26 to 56 by 26 to 41, now 44 by 44 for all 32 controls of the Frame tab, all 19 of the Export tab and 63 of the Look tab; toast Dismiss 44; status Dismiss 44; social row targets 44 to 54 wide, 48 tall. Contrast: Render disabled 4.57:1 (was 2.14), Undo 4.8:1 light and 5.56:1 dark (was 1.5, 1.84), Capture 5.01 and 5.3 (was 1.7, 2.18), showcase Open 5.32 and 6.77, toast Dismiss 5.32 (was 2.58), busy Render 9.92:1 (was 2.14). `bash .craft/verify.sh` green, `pnpm build` green.

## Review verdict

`emil-ui-review`: approve with changes, all made. Should fix, done: the notice stack's z-index did not apply (`z-notice` is not a Tailwind utility; now `z-(--z-notice)`, checked in the browser); the portaled phone sheet had no radii tokens, so the rows were square (defined on `.sc-sheet`, cited in SYSTEM.md); the sheet's Render scrolled out of reach once the chips grew (sticky footer). `emil-unslop-design`: no gradient, glow or emoji added; the five backdrop gradients are the change in that direction. `craft-design-engineering`: concentric radii (card 16, row padding 8, field 8), ring in the shadow stack and no border beside it, tabular numbers on counts and seconds, disabled as a token.

## Open

- The phone sheet's panel room is `phone-panel.ts` and `phone-sheet.ts` territory: with 44px chips the Export tab scrolls inside it and only the sticky footer is always visible; a taller room would show more rows.
- Saved projects whose backdrop is one of the old uiGradients values still render, and show no selected swatch.
- The LinkedIn chip has no room on the phone.
- The `emil-prototype` loupe, the corner row and the account island are untouched.
