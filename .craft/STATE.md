# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Land the gate's fixes (#166 to #172) through PRs #176, #177, #178 and #180; then re-run `/craft-harness:verify` on main (D9) with Docker up for the hosted journeys. Owner items unchanged (#65, #70, #71, #77, #79, #112).

## Plan (checkbox per verifiable unit)
- [x] #154 wave, #156 usage ledger, #158 phone pass two, #161 Polar billing, #162 migrate once, #163 opaque sheet, #164 citations: merged
- [x] #165 chore, #175 corrections (#173) merged 2026-10-06 night
- [ ] #176 phone (#169), #177 export (#166, #170), #178 landing (#171, #172), #180 studio (#167, #168): review, rework, merge on green
- [ ] Re-run the gate on main; #174 and #179 wait for a decision
- [ ] Owner: production Polar organisation, webhook endpoint, live token; staging (#70); then #71; Docker up before the next gate

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- #166+#170 export builder (export.store.ts, export-label.ts, png-snapshot); #167+#168 studio builder (project-chip, scene-shell, snippet.store, editor/preview); #169 phone builder (mobile-shell, phone rules of studio-camera.css); #171+#172 landing builder (hero.tsx, import-intent-boot); #173 corrections builder (account island, pr-import.ts, imports.spec.ts)

## Open findings from /craft-harness:verify
- 2026-10-06 full pass on main: DO NOT SHIP; findings are tickets #166 to #174, decisions in docs/decisions/2026-10-06-verify-gate-findings.md
