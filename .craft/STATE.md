# Running state (orchestrator)

Kept current by the orchestrator so that compaction or a new session loses nothing. One line per item; prune when done.

## Current goal
2026-10-12: design pass, passwordless auth, loupe and the Pipeline landing are all on main and on staging. Next: the UX waves of `docs/decisions/2026-10-12-ux-waves.md` (wave 1 = #250 #252 #258 then #257 #255; wave 2 = #254 #251 #256 #259 #260 #261; #253 deferred), then #71 on staging, then a gate pass. Weekly budget at ~87%: plan first, build on Bruno's go.

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
- 2026-10-12: nothing running. Staging (https://staging.typelapse.com) is deployed from main 213dc9d: #236 image, #238 drain workers, #235 manifests, #240 passwordless auth, #242 #243 #244 #245 design audit fixes, #247 loupe, #248 Pipeline landing, #249 sign-in form; `/health` lists every hosted capability true, mail included (Resend, domain typelapse.com verified).
- Next on Bruno's go: UX wave 1 PR A (#250 #252 #258), then PR B (#257 #255); #71 on staging (Bruno signs up and pays with the test card, an agent drives the rest); a gate pass on main before any release.
- Owner items: #65 (now #241 Cloudflare-only ingress), #77, #79, #112, #217, #246 (sheet default stop), #253 deferred.

## Open findings from /craft-harness:verify
- 2026-10-06 first pass: DO NOT SHIP, #166 to #174, all fixed but #174. Second pass (evidence 2026-10-06-main-2): DO NOT SHIP, #185 to #189; #179 #182 #183 opened along the way; second pass fixed through #191 to #196; follow-ups #197 #198. Third pass (evidence 2026-10-07-main-3): SHIP WITH NITS, #202 #203 #204 opened, #205 #207 #209 from reviews; fourth pass (evidence 2026-10-07-main-4): SHIP WITH NITS, #226 #227. Prep-for-prod audit (evidence 2026-10-07-prep-for-prod): READY WITH FIXES, #214 #215 #216 done, #217 owner
