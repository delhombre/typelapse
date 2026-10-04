# Domain documentation

Typelapse is a single-context repository: one Vite application, one Hono API,
one Remotion renderer, one domain. Engineering skills read one glossary and one
decision log.

## Before exploring

1. Read `CONTEXT.md` at the repository root: the glossary and the invariants.
2. Read the decision logs under `docs/decisions/` that touch the area you are
   changing; `docs/decisions/README.md` indexes them.
3. Read `goals/multimedia-saas/contract.md` and `state.md` for the product
   boundary and the current state of the hosted profile.

Missing context is not an error. `/domain-modeling`, usually reached through
`/grill-with-docs` or `/triage`, updates `CONTEXT.md` only when a term or an
invariant has actually been settled.

## Layout

```text
/
├── CONTEXT.md            # glossary and invariants
├── docs/decisions/       # dated decision logs (D-numbers), indexed by README.md
├── docs/agents/          # how agents work here: tracker, labels, quality loop
├── docs/research/        # cited research reports, when present (else the owner's notes)
└── goals/<goal>/         # contract, plan, evidence and state of a goal
```

## Vocabulary and decisions

- Use the exact terms defined in `CONTEXT.md` in issues, specs, tests and code.
  Do not introduce synonyms for an established concept.
- A decision log is the place a choice lives; a chat message is not. Every
  entry has a Pivot line, the one sentence Bruno can say to overturn it.
