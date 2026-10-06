# Contributing to Typelapse

Thanks for looking. This file says how to run the project, how a change is
judged, and how to show that it works.

## Run it

You need Node 24 and pnpm (the version is pinned in `package.json`).

```bash
pnpm install
pnpm dev          # the studio at http://localhost:5173/app
pnpm dev:server   # the local render API at http://localhost:3001
```

The local profile needs no account and no `.env`. The hosted profile (accounts,
private media, billing, queued renders) needs PostgreSQL, object storage and
Polar; the README's "Hosted profile" section lists the steps.

## Test it

```bash
pnpm vitest run tests/<area>   # the tests for what you touched
pnpm test                      # the full suite
pnpm check-types
pnpm typecheck:server
pnpm lint
pnpm build
```

A pull request runs the same gates in CI and cannot merge while one is red.

## The quality loop

The full version is `docs/agents/QUALITY_LOOP.md`. In three lines:

1. Read the ticket, `CONTEXT.md` and the decision logs in `docs/decisions/` that touch the same area, then write down the plan and its decisions.
2. Write a failing test for each behaviour first, then the least code that makes it pass; a visual change lands in the DOM preview, the Remotion composition and the Canvas painter, or it does not land.
3. Prove it against the real thing: the journey in a real browser, an exported file with `ffprobe`, and a gate that fails sends the work back to the step that caused it.

## Tickets

Work is tracked in GitHub Issues and on the project board (Project 4). Pick an
issue labelled `ready-for-agent` or `good first issue`, or open one first for
anything larger than a small fix, so the approach is agreed before the code.
Labels and columns are described in `docs/agents/triage-labels.md` and
`docs/agents/issue-tracker.md`.

## Writing rules

- No em-dashes, anywhere: code, comments, docs, UI copy, commit messages. Use a
  comma, a colon, a full stop or parentheses.
- Comments say why, not what, in English.
- UI copy is one plain sentence, without exclamation marks.

## Prove your change

Put this in the pull request description:

- What changed and why, in a few lines.
- The tests you added, and that you saw them fail before they passed.
- The proof: the command you ran and what you observed (a screenshot of the
  screen, the `ffprobe` line for an exported file, the response of an API
  call).
- What you could not verify, and why.

## Licence

Typelapse is licensed under AGPL-3.0-only. By contributing you agree that your
contribution is licensed under the same terms.
