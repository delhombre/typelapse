# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Everything built this round is on main. Next unit of work starts from a fresh branch off main; the open board items are the owner's (#65, #70, #71, #77, #79, #112).

## Plan (checkbox per verifiable unit)
- [x] #154 wave, #156 usage ledger, #158 phone pass two, #161 Polar billing, #162 migrate once, #163 opaque sheet, #164 citations: merged
- [ ] Owner: production Polar organisation, webhook endpoint, live token; staging (#70); then #71

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- none

## Open findings from /craft-harness:verify
- not run yet
