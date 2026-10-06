# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Merge PR #154 (the wave after the UI passes) once the gates are green, then start #152 and #153.

## Plan (checkbox per verifiable unit)
- [x] #139 to #151 built, reviewed (Ship gate: rework, then merge-ready) and committed on `claude/wave-after-passes`
- [x] Autosave bug fixed (a redo inside the debounce window no longer loses the last state)
- [ ] Gates green on the branch after the fixes: lint, both type checks, test, build, `pnpm e2e`, `pnpm e2e:hosted`
- [ ] PR #154 merged with a merge commit; issues #139 to #151 closed by the PR
- [ ] #152 usage survives a project delete; #153 the phone's second pass

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- none; the worktree is idle while the gates run

## Open findings from /craft-harness:verify
- not run yet
