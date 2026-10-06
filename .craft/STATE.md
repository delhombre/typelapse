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
- #166+#170 export builder (export.store.ts, export-label.ts, png-snapshot); #167+#168 studio builder (project-chip, scene-shell, snippet.store, editor/preview); #169 phone builder (mobile-shell, phone rules of studio-camera.css); #171+#172 landing builder (hero.tsx, import-intent-boot); #173 corrections builder (account island, pr-import.ts, imports.spec.ts)

## Open findings from /craft-harness:verify
- 2026-10-06 full pass on main: DO NOT SHIP; findings are tickets #166 to #174, decisions in docs/decisions/2026-10-06-verify-gate-findings.md
