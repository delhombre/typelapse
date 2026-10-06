# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Land PR #161 (Polar billing) after its rework and one real sandbox run; then #157, #159, #160.

## Plan (checkbox per verifiable unit)
- [x] #154 the wave after the passes, #156 usage ledger, #158 phone pass two: merged
- [ ] #161 Polar billing: rework (migration 0009 guards, sandbox journey must fail not skip, real webhook payload, second-checkout refusal), then the sandbox journey with a valid token, then merge
- [ ] #157 migrate once (worktree migrate-once), #160 opaque sheet (worktree sheet-opaque): building
- [ ] #159 SYSTEM.md citations: after #160

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- #161 builder: server/billing, migrations 0009, tests/e2e/hosted/billing.spec.ts, scripts/polar-sandbox-products.ts (this worktree)
- #157 builder: vitest setup, tests/server/*.contract.test.ts, ci.yml (worktree migrate-once)
- #160 builder: phone sheet styles, DECISIONS D5, SYSTEM.md, studio-phone pass file (worktree sheet-opaque)

## Open findings from /craft-harness:verify
- not run yet
