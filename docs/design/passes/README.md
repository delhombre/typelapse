# Screen passes

One file per screen pass, named `YYYY-MM-DD-<screen>.md`
(`docs/decisions/2026-10-05-ui-passes.md` D2 names the screens). A pass runs
Emil's order from `docs/agents/QUALITY_LOOP.md` gate 4, one or two skills per
run, looking at the screen in between. Read `../SYSTEM.md` and
`../DECISIONS.md` first: a pass uses the tokens that exist, and settles a
Drift row rather than adding a third value.

Values, not adjectives: write `150ms var(--ease-out) on background-color`,
not "smoother hover". Copy this template; every heading stays, write
"none" under one that has nothing.

```md
# Pass: <screen>, YYYY-MM-DD

## Screen

The route, the shell (desktop, phone or both) and the components in scope,
with their files. What is out of scope.

## Before

Screenshots at 1440 and 375, light and dark, with their paths. What a person
sees go wrong, measured: the element, the value, the file and line.

## Decisions

One line per decision: the skill that raised it, what changed, and why.
A change to a token names the `SYSTEM.md` row it updates; a settled Drift row
is deleted there in the same change. A new standing rule is added to
`DECISIONS.md` as the next D-number, with Why, Enforced by and Pivot.
Motion is written as durations, curves and the properties animated.

## After

The same four screenshots, and the focused tests and e2e specs run, with
their results.

## Review verdict

The `emil-ui-review` verdict (blocked, approve with changes, ship it), its
"Should fix" list, and what was done about each item.

## Open

What the pass saw and did not fix, and who owns it.
```
