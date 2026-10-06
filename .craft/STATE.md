# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
Gate's second pass on main (16691e1): DO NOT SHIP again, decisions in docs/decisions/2026-10-06-gate-second-pass.md. Land #185 to #189 and #184, then a third pass. Owner items unchanged (#65, #70, #71, #77, #79, #112).

## Plan (checkbox per verifiable unit)
- [x] #154 wave, #156 usage ledger, #158 phone pass two, #161 Polar billing, #162 migrate once, #163 opaque sheet, #164 citations: merged
- [x] #165 chore, #175 corrections (#173) merged 2026-10-06 night
- [x] #176 phone (#169), #177 export (#166, #170), #178 landing (#171, #172), #180 studio (#167, #168) merged 2026-10-06 night
- [x] Second gate pass run (Docker up): D1 to D8 of the first pass hold, D4 partial
- [ ] #185 focus crash + boot guard (P1), #186 one-line title, #187 phone panels under the frame, #188 display cells (Opus), #189 corrections, #184 flaky e2e: review, rework, merge on green
- [ ] Third gate pass; #174, #179, #182 wait for a decision
- [ ] Owner: production Polar organisation, webhook endpoint, live token; staging (#70); then #71; Docker up before the next gate

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06 night, second pass: `2026-10-06-gate-second-pass.md` D1 to D5 (no unbounded loop and a boot guard; one-line title; phone panels under the frame; display cells; nits).
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- #185 builder (focus files, focus field, persistence boot, CONTEXT.md); #186 builder (frame-chrome, Remotion chrome, painter.ts title hunk, application/layout/window-title.ts); #187 builder (cluster-panels, phone panel rules, mobile-shell.spec); #188 Opus builder (engine.ts, application/text/display-width.ts, frame-painter/text.ts, typewriter, keyer); #189 builder (snippet.store title, share boot parsing, plan.store/billing client, toast placement, Monaco setup)

## Open findings from /craft-harness:verify
- 2026-10-06 first pass: DO NOT SHIP, #166 to #174, all fixed but #174. Second pass (evidence 2026-10-06-main-2): DO NOT SHIP, #185 to #189; #179 #182 #183 opened along the way
