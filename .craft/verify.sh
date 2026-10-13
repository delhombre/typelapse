#!/usr/bin/env bash
# craft-harness verification gate (web). Exits non-zero on the first failing step.
# Keep it fast: it runs every time a subagent that changed files tries to finish.
# Edit STEPS to match the scripts that exist in package.json.
set -euo pipefail
cd "$(dirname "$0")/.."

STEPS=(
  "pnpm lint"
  "pnpm check-types"
  "pnpm typecheck:server"
  "pnpm test"
)
# Recorded tester.army flows replay without a model. Opt in once they exist:
#   CRAFT_E2E_IN_GATE=1  (or add "npx e2e run" to STEPS)
if [ "${CRAFT_E2E_IN_GATE:-0}" = "1" ] && [ -f e2e.config.ts ]; then
  STEPS+=("npx e2e run")
fi

# One real clip through the Remotion path, then ffprobe on it (~4 s warm, ~35 s on
# a cold checkout that must still download Chrome). Off by default because it is
# too slow for every subagent stop. The orchestrator sets it for the
# /craft-harness:verify gate (docs/agents/QUALITY_LOOP.md, gate 5), and CI runs the
# same script as a step of the "Quality gate" job. Vitest and tsc pass while a
# Remotion bundle is broken (#237), so a green gate without this proves nothing
# about renders. The summary line is last, so `tail` keeps it.
if [ "${CRAFT_VERIFY_RENDER:-0}" = "1" ]; then
  STEPS+=("pnpm render:smoke")
fi

# jsdom answers a call it does not implement (a canvas context, window.scrollTo)
# with a "Not implemented" line and carries on, so the tests pass while the log
# fills with it and buries a real error (#300). A test that reaches such a call
# stubs it for its own file (tests/support/jsdom-gaps.ts); the gate fails if one
# is left unstubbed. The grep reads the whole log, before `tail` trims it.
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

for step in "${STEPS[@]}"; do
  echo "== $step"
  if ! eval "$step" >"$log" 2>&1; then
    tail -n 80 "$log"
    echo "!! FAILED: $step"
    exit 1
  fi
  tail -n 80 "$log"
  if grep -q "Not implemented" "$log"; then
    echo "!! FAILED: $step printed jsdom \"Not implemented\" lines ($(grep -c "Not implemented" "$log")); first:"
    grep -m3 "Not implemented" "$log"
    echo "   Stub the call in the test file that makes it: tests/support/jsdom-gaps.ts"
    exit 1
  fi
done
echo "== craft verify: OK"
