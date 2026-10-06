# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Merge PR #161 (Polar billing) once the real sandbox journey is green; land #159 (citations).

## Plan (checkbox per verifiable unit)
- [x] #154, #156, #158, #162, #163 merged (wave, usage ledger, phone pass two, migrate once, opaque sheet)
- [ ] #161 Polar billing: code complete and re-reviewed; the sandbox journey runs now with the owner's token; then merge main in, CI, merge
- [ ] #159 SYSTEM.md citations: building (worktree citations)

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- #161 builder: sandbox journey run, scripts/polar-sandbox-products.ts, tests/e2e/hosted/billing.spec.ts (this worktree)
- #159 builder: docs/design/SYSTEM.md, tests/docs/design-system.test.ts, docs/design/passes/README.md (worktree citations)

## Open findings from /craft-harness:verify
- not run yet
