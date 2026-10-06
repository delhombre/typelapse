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

for step in "${STEPS[@]}"; do
  echo "== $step"
  if ! { eval "$step" 2>&1 | tail -n 80; }; then
    echo "!! FAILED: $step"
    exit 1
  fi
done
echo "== craft verify: OK"
