# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
2026-10-14 noon: gate pass seven on main (SHIP WITH NITS) and every follow-up of the night are merged (#303 #322 #323 #324 #325 #326 #327 #328 #329 through PRs #303 #324 #325 #326 #327 #328 #329); staging follows main (eac8273). Building: #331 (line length cap + empty colour normalisation, a real exposure) and #330 (zoom during a break, polish). Then: gate pass eight, #246 triage, the owner items. The agent backlog is otherwise empty.

## Plan (checkbox per verifiable unit)
- [x] #154 wave, #156 usage ledger, #158 phone pass two, #161 Polar billing, #162 migrate once, #163 opaque sheet, #164 citations: merged
- [x] #165 chore, #175 corrections (#173) merged 2026-10-06 night
- [x] #176 phone (#169), #177 export (#166, #170), #178 landing (#171, #172), #180 studio (#167, #168) merged 2026-10-06 night
- [x] Second gate pass run (Docker up): D1 to D8 of the first pass hold, D4 partial
- [x] #185 (#193, Opus rebuild after review), #186 (#191), #187 (#195), #188 (#194), #189 (#192), #183 (#184) merged 2026-10-06/07 night
- [x] #197 (#200), #198 (#201), #202 (#206) merged 2026-10-07
- [x] #203 (#208) merged 2026-10-07
- [x] after-the-gate D1-D8: #213 #218 #219 #220 #221 #223 #225 merged 2026-10-07 (#174 #179 #182 #204 #205 #207 #209 #214 #215 #216 closed)
- [x] Fourth gate pass on e6c1497: SHIP WITH NITS
- [x] #226 (#231), #227 (#229) merged 2026-10-08; Bruno chose the caption plate (D10)
- [ ] Owner: production Polar organisation, webhook endpoint, live token; staging (#70); then #71; Docker up before the next gate

## Decisions (date, decision, why)
- Every product decision lives in `docs/decisions/` (D-numbers, Pivot lines); this file only points there. Latest: `2026-10-05-next-wave.md` D1 to D12.
- 2026-10-06 night, second pass: `2026-10-06-gate-second-pass.md` D1 to D5 (no unbounded loop and a boot guard; one-line title; phone panels under the frame; display cells; nits).
- 2026-10-06, craft-harness enabled: `.craft/verify.sh` is the gate a builder must pass; tester.army e2e on Gemini Flash through the shell's key, replay without a model.

## In flight (agent, files owned, status)
- 2026-10-14 noon: #331 builder (whole-line-tokenization option, plan.ts colour normalisation, the three Shiki call sites) and #330 builder (video-script zoom during a break). Nothing else.
- Staging (https://staging.typelapse.com) deployed from main eac8273 by `scripts/deploy/staging.sh`. Hosted journeys run in CI on hosted-side PRs (one worker, the `Hosted gate` job was removed by #340 and comes back from the history of `ci.yml` the day #302 requires the journeys).
- Owner items: #65 (now #241), #71 remaining steps, #77, #79 (refund terms before any real price), #112, #217, #302 (require the hosted journeys: restore Hosted gate first), #246 and #253 to triage.
- Lessons kept from the night: builders in their own worktrees and scratchpad folders; cap at five parallel vitest runs (the machine fails timing tests past a load of about 100; #318 made the known ones deterministic); a background `gh` loop must tolerate api.github.com blips.

## Open findings from /craft-harness:verify
- 2026-10-06 first pass: DO NOT SHIP, #166 to #174, all fixed but #174. Second pass (evidence 2026-10-06-main-2): DO NOT SHIP, #185 to #189; #179 #182 #183 opened along the way; second pass fixed through #191 to #196; follow-ups #197 #198. Third pass (evidence 2026-10-07-main-3): SHIP WITH NITS, #202 #203 #204 opened, #205 #207 #209 from reviews; fourth pass (evidence 2026-10-07-main-4): SHIP WITH NITS, #226 #227. Prep-for-prod audit (evidence 2026-10-07-prep-for-prod): READY WITH FIXES, #214 #215 #216 done, #217 owner. Fifth pass (evidence 2026-10-13-verify-main): DO NOT SHIP, #268 #269 blocking, #270 #271 major, #272 minors, all fixed. Sixth pass (evidence 2026-10-13-verify-main-6, main 20c9118): SHIP WITH NITS, #300 and the stale preview on 5281 (killed), hosted sheet comment (fixed in #299). Seventh pass (evidence 2026-10-14-verify-main-7, main 9fb01e0): SHIP WITH NITS, #322 major (marker row grew the card, fixed in #326), #323 minors (fixed in #327)
