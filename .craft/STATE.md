# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
2026-10-14 morning: gate five, wave 2 and the follow-up backlog are merged (#299 #301 #304 #305 #306 #307 #308 #311 #312 #317 #318), staging follows main. Open: #303 (hosted journeys in CI, part of #302), the owner items, #246 and #253 to triage, and the new follow-ups #315 (Shiki under load), #316 (firstRow during a break), #319 (FileReader onerror). Next: merge #303, run gate pass seven on main with `CRAFT_VERIFY_RENDER=1`, then the three follow-ups, then #246.

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
- 2026-10-14: #303 (hosted-e2e.yml, ci.yml aggregator job, paths filter, billing.spec external_customer_id) in its second review round. Nothing else building.
- Staging (https://staging.typelapse.com) is deployed from main 3b48a72 by `scripts/deploy/staging.sh` (#308: kube() retries, smoke tolerant of lost polls). Deploy with `gh workflow run deploy-staging.yaml --ref main`.
- Owner items: #65 (now #241), #71 remaining steps, #77, #79 (refund terms before any real price), #112, #217, #246, #253 deferred.
- Lesson of the night: builders must work in their own worktrees (the shared checkout was switched twice) and in their own scratchpad folder (a shared `pr.md` overwrote a PR body once); the machine saturates past five parallel vitest runs (load 100 to 300 made timing tests fail), so cap builders at five.

## Open findings from /craft-harness:verify
- 2026-10-06 first pass: DO NOT SHIP, #166 to #174, all fixed but #174. Second pass (evidence 2026-10-06-main-2): DO NOT SHIP, #185 to #189; #179 #182 #183 opened along the way; second pass fixed through #191 to #196; follow-ups #197 #198. Third pass (evidence 2026-10-07-main-3): SHIP WITH NITS, #202 #203 #204 opened, #205 #207 #209 from reviews; fourth pass (evidence 2026-10-07-main-4): SHIP WITH NITS, #226 #227. Prep-for-prod audit (evidence 2026-10-07-prep-for-prod): READY WITH FIXES, #214 #215 #216 done, #217 owner. Fifth pass (evidence 2026-10-13-verify-main): DO NOT SHIP, #268 #269 blocking, #270 #271 major, #272 minors, all fixed. Sixth pass (evidence 2026-10-13-verify-main-6, main 20c9118): SHIP WITH NITS, #300 and the stale preview on 5281 (killed), hosted sheet comment (fixed in #299)
