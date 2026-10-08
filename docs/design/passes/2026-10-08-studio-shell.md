# Pass: the studio shell on a phone, 2026-10-08

## Screen

`/app` below 1280: the corner row, the stage, the More menu, the project menu,
the bottom sheet's stops, the island's root row. Decision log
`docs/decisions/2026-10-08-design-audit.md` D3, D4, D6 (D5, the code loupe, waits
for Bruno). Files: `src/application/layout/phone-sheet.ts` (and `phone-panel.ts`,
`stage-frame.ts`), `components/layout/` (`mobile-shell.tsx`, `studio-utilities.tsx`,
`studio-account-island.tsx`, `project-chip.tsx`), `components/multimedia/studio-account-control.tsx`,
`stores/theme-mode.store.ts`, `index.html`, the shell blocks of `src/app.css`.
Out of scope: the panels, toasts, Monaco, the step builder (#244 owns them and
`--camera-disabled`).

## Before

Measured with an Android emulation (DPR 2.625) on builds of `origin/main`, local
and hosted, a 63 character title, light and dark. Shots and JSON in
`.craft/evidence/2026-10-08-shell-fix/` (`before-*`).

- Hosted, five chips: at 360, 390 and 412 `elementFromPoint` at the middle of
  "Open project menu" is the history chip's glyph; the project chip holds 124 of
  content in 79 (360), 144 in 93 (390). The project list and New project could not
  be opened by touch. Local had four chips and overflowed by 5 (a hit area).
- The frame: 310x174 centred at the peek (390), refit to 213x120 at the scenes
  stop; 177x100 at 360. Code 2.2 to 3.9 effective px.
- Appearance: two states; one tap pinned a side for good.

## Decisions

- D3: no account chip on the phone. The More menu's first section draws the
  account (Sign in; or the name, the plan and Sign out), and the panel (address,
  then code; or the account) replaces the menu's rows with a way back. The island
  stays mounted with the menu shut, so the session check, cloud save and the plan
  run as before. The project chip clips across at its edge, its floor is the real
  row's (139 at 390: `calc(4.6em + 4px)` for the name), and the menu's head says the
  name in full.
- D4: the frame is the stage's width, hung under the row at every stop; the stage
  slot is the frame's height, so the sheet never refits it. The scenes stop is what
  the frame and the 72px instrument room leave (`DOCK_ROOM` was 116: 46px of it
  waited for an export status above a 60px bar). 9:16 has no scenes stop.
- D6: Light, Dark, System, System by default and live; only a forced side writes
  `theme-color`. A side the old toggle stored is read as System once.
- The editor fills the full stop; a finger on the handle starts Monaco. The
  island's row keeps "Settings" and "Social" while it holds nothing else.

## After

`after-hosted-*` in the same folder, signed in through the More menu.

| Width | Frame peek / scenes / full | Code px | Chip fit | Corner row misses |
| --- | --- | --- | --- | --- |
| 360 | 344x193.5 at y 68, all three | 4.29 | 121/121 | none |
| 390 | 374x210.4 at y 68, all three | 4.67 | 139/139 | none |
| 412 | 396x222.8 at y 68, all three | 4.94 | 161/161 | none |
| 768 | 752x423 at y 68, all three | 9.38 | 517/517 | none |
| 1440 | 753.8x424 (unchanged) | 9.41 | 308/308 | none |

Theme, live at 412: System follows the OS both ways with the metas at index.html's
values; a forced side holds through an OS switch and writes both metas.

## Review verdict

`emil-ui-review`: approve with changes, made: the menu's row rule took every
button in it (the account's primary lost its fill), Escape on the account's rows
was swallowed, the theme flip ran every transition at once.

## Open

- Code legibility (D5): 4.7px at 390 is still not readable; the loupe is Bruno's call.
- `--camera-disabled` lands with #244; the menu's disabled rows read it then.
