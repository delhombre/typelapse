# Spike: tester.army/e2e (ticket #122, decision log 2026-10-04 D3)

Verdict: keep as an optional exploratory tool, never a gate, and only once an owner key exists. The deterministic half is a competent Playwright wrapper; the agent half is unproven here because no model key was available.

## What it is
- Package `e2e` 0.17.0 plus `@e2e-dev/web` 0.12.0 (Playwright engine), `@e2e-dev/mobile`, `@e2e-dev/github`. Licence Apache-2.0. Node 22.12 or newer.
- Maintainers on npm: okwasniewski (Oskar Kwasniewski) and szymonrybczak. Repo tester-army/e2e: created 2026-07-22, 2.35k stars, 35 open issues, last push 2026-10-04, releases every few days. The README says "in active development on the way to 1.0": APIs may change between minors.
- Peer deps: `ai` ^7 (Vercel AI SDK) plus a provider package. No default model, no shared key variable. Model is set in `e2e.config.ts`; Anthropic is `anthropic('...')` from `@ai-sdk/anthropic`, which reads `ANTHROPIC_API_KEY`. Also gateway, OpenRouter, local OpenAI-compatible, or a ChatGPT/Copilot/SuperGrok subscription via `e2e login`.
- Telemetry is on by default (counts and versions, no test content). `e2e telemetry disable`, `E2E_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` turns it off.
- "Cached agent steps" (docs/cache.mdx): a passing `agent.act()` is recorded as concrete actions (role, name, test id, context of each control), verified by the resulting route and screen changes, and replayed with no model call next run. If a control or end state differs, the agent takes over live. `agent.assert`, `waitFor` and `extract` are never cached. The key includes test name, instruction, params, agent and the engine major.minor, so an engine upgrade invalidates it. Cache lives in `.e2e/cache`, gitignored by default; committing it is opt-in.

## How it ran here
- Scratch project in the ticket scratchpad (`122/e2e-try`): `npm i e2e`, `npx e2e init --yes`, `npm i -D @ai-sdk/anthropic`, `npx e2e-web install chromium` (downloaded a 94 MB headless shell). 71 MB of node_modules.
- App: `pnpm build` (17 s, 6144 MB heap), served with `vite preview --port 5277`, stopped at the end.
- Three tests in `tests/`: `export-mp4`, `diff-import`, `not-found`. Each mixes `expect`/locators with `agent.act` or `agent.assert`.
- Without a key the tool does not skip agent steps: the first `agent.act` fails with `MODEL_PROVIDER_FAILED: Anthropic API key is missing`, in 330 ms, and everything before it passed. I gated the agent steps on `ANTHROPIC_API_KEY` with a deterministic fallback (`if (AI) agent.act(...) else tap(...)`), which is the shape to keep.
- Deterministic result: 3 of 3 pass, 6 runs in a row (1 + 5), 5.0 to 6.3 s for the whole suite. The exported file from `browser.waitForDownload` is a real H.264 1920x1080 1.0 s MP4 (ffprobe). No flake observed; the sample is small.
- Agent steps, cache hit rate, token cost: not run. No cost per run is measured. The docs' own example summary reads "4.1k tokens, 2 model calls" for a small suite, which is an illustration, not a measurement.

## What it found beyond a scripted test
- Nothing from the agent (not run). One finding came from writing the tests: importing a two-hunk diff (and a two-file diff) yields 3 scenes, not the 2 the ticket expected. Probably an intended extra scene; the test pins 3. Worth a one-line confirmation from whoever owns diff-to-steps.
- Structural value the docs claim and I could not exercise: `agent.act` survives renamed labels, `e2e explore '<goal>'` hunts for bugs without a test file, `agent.assert` can judge a screenshot (`vision: true`), which a Playwright selector cannot (for example "the preview looks like a code card").

## Beside tests/e2e (W7-A)
- No `tests/e2e` exists yet in this worktree; the repo has `@playwright/test` 1.62.1. e2e pins its own `playwright-core`, so two Playwright versions and two browser caches (the cache is shared only when versions match).
- Keep W7-A's Playwright tests as the PR gate and nightly set (D2). Put e2e in a separate directory outside the Playwright `testDir` (it also uses `*.e2e.ts`, which is a different convention from `*.spec.ts`), with its own job, `continue-on-error`, no required check.
- Its deterministic locators duplicate what Playwright does and add nothing; only `agent.*` and `explore` justify the dependency.

## Recommendation: keep, conditional
Keep as a non-blocking nightly or manual explorer if, and only if, all hold:
1. The owner supplies a key (see below) and a run of the three tests shows the second run at 0 model calls for `act` steps (the cache works on this app's animated UI) and the agent steps pass on two consecutive runs.
2. Cost per full run stays under a ceiling the owner sets (suggest under 1 EUR, nightly only).
3. It never becomes a required check and never edits tests. If 1 fails, drop it and revisit at e2e 1.0.

## Owner step to enable the agent half
1. Create an Anthropic key, export it as `ANTHROPIC_API_KEY` in the shell (never in a file or the repo). In CI later: a repository secret of the same name.
2. In `122/e2e-try` run `npx e2e run` twice, then `npx e2e cache ls`; the run summary prints tokens, model calls and "replayed / handed off / missed". Record those numbers here.
3. Model id in the config is `claude-sonnet-4-5` (my pick, unverified against the key); change it to the model the owner wants to pay for.

Side effects to know: `e2e telemetry disable` wrote `~/.config/e2e/telemetry.json` (the CLI had run `--help` and `init` before that, so a few usage pings may have gone out). Nothing was written in the repository except this file.

## Sources
- https://tester.army/e2e, https://github.com/tester-army/e2e, https://www.npmjs.com/package/e2e
- Package docs shipped in the install: `node_modules/e2e/docs/` (cache.mdx, models.mdx, agent-steps.mdx, ci.mdx, browser.mdx, telemetry.mdx)
- `gh api repos/tester-army/e2e` (stars, dates, contributors, releases), `npm view e2e`
- docs/decisions/2026-10-04-open-source-e2e-and-growth.md (D2, D3)
