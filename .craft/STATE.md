# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Land the three follow-ups: #155 billing through Polar (branch claude/billing-polar, this worktree), #152 usage ledger (PR #156, in Ship-gate review), #153 phone pass two (worktree phone-pass-2).

## Plan (checkbox per verifiable unit)
- [x] #139 to #151 built, reviewed (Ship gate: rework, then merge-ready) and committed on `claude/wave-after-passes`
- [x] Autosave bug fixed (a redo inside the debounce window no longer loses the last state)
- [x] Gates green, PR #154 merged, issues #139 to #151 closed
- [ ] #152 usage ledger: PR #156 open, Ship-gate review running
- [ ] #153 phone pass two: building
- [ ] #155 Polar billing: building; sandbox org Typelapse and token exist, in this worktree's .env

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- #155 builder: server/billing, routes/billing, billing adapter, account island plan state, README/CONTEXT/.env.example (this worktree)
- #153 builder: phone shell, studio-account-control.css, SYSTEM.md Drift 18/19, DECISIONS D5 (worktree phone-pass-2)
- #156 reviewer: read-only on worktree usage-ledger

## Open findings from /craft-harness:verify
- not run yet
