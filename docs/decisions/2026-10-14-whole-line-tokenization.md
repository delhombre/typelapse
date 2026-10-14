# Whole-line tokenization: no clock in the token plan

Builder on #315, 2026-10-14. The trigger: during the #307 review on a loaded
machine, keyer tests failed in a parallel run and passed alone. Shiki's per-line
time limit had cut `greet(name: string) {` into one token, and the client keyer's
cache kept it. Touches the two keyers of [scene-break](2026-10-14-scene-break.md).

## D1 One option, time limit off, everywhere a frame is tokenized

**Decision:** `WHOLE_LINE_TOKENIZATION` (`src/infrastructure/highlighting/whole-line-tokenization.ts`)
is `{ tokenizeTimeLimit: 0 }`. The studio's keyer, the server's keyer
(`server/remotion/magic-move-plan.ts`) and the static poster (`shiki.adapter.ts`)
spread it into their Shiki options. At 0 vscode-textmate skips the check.

**Why:** the limit is wall clock, so with it the tokens depend on how busy the
machine is, and the hosted render (a shared node, D5 of [staging](2026-10-08-staging.md))
can build a different plan from the device for the same project. Shiki 3.23 reads
`tokens` from `tokenizeLine2` and drops `stoppedEarly`, so a cut line cannot be
detected from outside: off is the only setting under which a cached tokenization is
known whole. Measured on an idle M-series machine (TypeScript, oniguruma): a
72-column line, the width a scene is built for, takes 0.34 ms; 500 columns 10.5 ms;
5,000 columns 171 ms. The default 500 ms never protected a line a frame holds; it
only fired on a descheduled process.

**Rejected:** a raised finite limit with a retry (no signal to retry on; a token-count
heuristic misfires on comment lines, which are one token); keeping the limit and not
caching (the server has no cache and still diverges).

**Residual:** a grammar that backtracks catastrophically on hostile input now runs
to the end instead of bailing at 500 ms, and tokenizing is synchronous, so the
worker's render timeout (`TYPELAPSE_RENDER_TIMEOUT_MS`) is not proven to cut it
short. Not covered here; the deterministic lever is a per-line length cap
(`tokenizeMaxLineLength`), the same on both sides.

**Proof:** `tests/support/stalled-clock.ts` advances `Date.now()` a second per read,
which trips the limit on every line. Without the option both new tests fail (each
line one token); with it the stalled plan equals the unhurried one, the client's
cache holds it, and the server's plan for the hono fixture equals the studio's.
