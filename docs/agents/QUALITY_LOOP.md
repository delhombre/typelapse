# Quality loop

Every unit of work (a feature, a fix, a screen, a refactor) runs these gates
in order, so an agent can work alone and the owner only reads and pivots. Each
gate ends on a **pass condition** you can check. A feeling of being done is
not a pass. Engineering skills are Matt Pocock's plugin, called by namespace
(`mattpocock-skills:tdd`), so a same-name skill installed elsewhere never
answers instead.

**The loop rule.** A gate that fails sends the work back to the gate that
**owns the cause**, never forward. Loosening a threshold, skipping a route or
suppressing a check is also sending it forward. After a fix, re-run every gate
from the owning gate onwards.

| Failure | Owning gate |
| --- | --- |
| A product or market fact is missing | 0 Frame (run `research`) |
| The plan was wrong: wrong screen, wrong behaviour, a reviewer disputes the intent | 1 Grill |
| A term, an invariant or a seam is wrong | 2 Model |
| A test is red, a type error, a renderer drifts from the others | 3 Build |
| The screen looks off, feels cheap, or a UI review blocks | 4 Interface |
| A journey breaks in a real browser or an export file lies about itself | 5 Prove |

## Gates

### 0 Frame

Read `CONTEXT.md`, the decision logs in `docs/decisions/` that touch the same
area, `goals/multimedia-saas/contract.md` and `state.md`, and the ticket. When
a fact is missing (a competitor's behaviour, a codec limit, a licence term),
run `mattpocock-skills:research` and cite what it found in the
owner's notes, or under `docs/research/` when present. Apply Pstack **Foundational Thinking** before writing logic:
core types, what concurrent actors share.

**Pass:** the decision log opens with its three context lines, naming the
ticket and the D-numbers it touches.

### 1 Grill

Run `mattpocock-skills:grilling` against your own plan, and play both sides. Build the
design tree, work its frontier round by round, answer every question with your
recommended answer, and take that answer. Decisions are yours, recorded so the
owner can overturn any of them with one sentence. Apply Pstack **Attack the
Premise** when two fixes shared a premise and both failed, and **Exhaust the
Design Space** when the interaction has no precedent: build two or three
directions with `emil-prototype` behind a picker and settle it by looking.

Stop only a branch that is **irreversible or outside the brief**: deleting
data, prices, legal or privacy copy, a public claim, spending money, security
posture. Mark it `needs owner` in the log and keep working the other branches.

**Pass:** the frontier is empty and `docs/decisions/YYYY-MM-DD-<slug>.md`
exists in the format of `docs/decisions/README.md`, indexed there.

### 2 Model

When the work touches the domain (an entity, an invariant, a use case, a
term), run `mattpocock-skills:domain-modeling` for the language and
`mattpocock-skills:codebase-design` for the module shape and its seams, with Pstack **Model the Domain**, **Boundary
Discipline** and **Type System Discipline**. Otherwise write "no domain
change" in the log.

**Pass:** new terms are in `CONTEXT.md`, and the log lists the seams gate 3
will test.

### 3 Build

Run `mattpocock-skills:tdd` at the seams from gate 2: one test, seen red, then the least code to
make it green, one slice at a time. For a bug, run `mattpocock-skills:diagnosing-bugs` first so
the bug becomes a red test (Pstack **Fix Root Causes**). Apply **Laziness
Protocol** and **Subtract Before You Add**: the smallest diff, delete first.
Edit, never rewrite: `Edit` with the smallest unique strings; `Write` is for a
new file only.

Renderer rule: a visual feature lands in the DOM preview, the Remotion
composition and the Canvas painter, or it does not land. Put the math in
`src/application` and test it once there.

**Pass:** every behaviour in the log has a test you saw fail before it passed;
the touched test files, `pnpm check-types` and `pnpm biome check` on your
files are green.

### 4 Interface

Read `docs/design/SYSTEM.md` (tokens) and `docs/design/DECISIONS.md` (doctrine) first; a screen pass writes `docs/design/passes/YYYY-MM-DD-<screen>.md`.

For anything a person sees, follow Emil's order from the aiforui course
("How to use aiforui skills"), one or two skills per run, looking at the
screen in between:

1. **Decide** (optional): `emil-prototype` when the direction is unclear.
2. **Build**: `emil-design-foundations` first on almost every screen, then
   one **material** skill for what the screen is made of:
   `emil-forms-and-inputs` (anything typed into or pressed), `emil-surfaces`
   (cards, modals, dropdowns, borders, shadows), `emil-typography`,
   `emil-component-design` (props others reuse), `emil-marketing-pages`
   (landing; pulls the others in).
3. **Refine**: `emil-ui-polish` (the cheap feeling), then as needed
   `emil-animations`, `emil-performance`, `emil-mobile-native`,
   `emil-touch-and-accessibility`. `craft-design-engineering` (Gustavo
   Fior's Craft, craft.gustavofior.com) is the second polish voice for the
   details: hover and press states, borders and radii, icons, numbers,
   sound, data. Run it after `emil-ui-polish`, never in the same pass.
4. **Review**: `emil-ui-review` on the diff. Fix the "Should fix" list.

Cheatsheet: looks off → design-foundations; feels cheap → ui-polish; feels
slow → performance; wrong on a phone → mobile-native; animation off →
animations; looks vibe-coded → unslop-design; unsure which → `emil-ask-emil`.
Motion is QA'd with Lapse: record the take, hand the agent the frame state,
not an adjective (see the course's "Reviewing animations" lessons). The UI
reference is ui.camera: direct, calm, the frame on the paper, controls in the
island.

**Pass:** `emil-ui-review` returns "ship it" or "approve with changes" with
the changes made; a before and after screenshot is in the report.

### 5 Prove

Pstack **Prove It Works**: verify against the real artifact, not a proxy. A
journey is proven in a real browser (`agent-browser`, own ports). When other
agents edit the same worktree, HMR reloads the page mid-test and can leave two
instances alive, so prove against `vite build` served by `vite preview`, or a
Vite started with `hmr: false` and `watch: null` from a config outside the
repo, restarted after every source edit. An export is proven with `ffprobe` on
the downloaded file and a frame compared with the preview. A hosted flow is
proven against a disposable PostgreSQL. Do not run the full `pnpm test` while
another agent runs anything in the same worktree; the orchestrator runs the
full suite, `pnpm build` and `pnpm lint` once, serially, before a commit.

If the brief does not mention `CRAFT_VERIFY_RENDER=1`, set it yourself. The render itself is proven too, because Vitest, `tsc` and `vite build` all pass
while Remotion's own webpack cannot bundle the composition (an `@/` import broke
every server render for days, #237). `pnpm render:smoke` renders a two-second clip
through the shipped `/render` route and prints one line: the file, then ffprobe's
length, size, codec and resolution. `.craft/verify.sh` runs it only when
`CRAFT_VERIFY_RENDER=1` (about 4 s warm, 35 s on a first checkout that downloads
Chrome), so a subagent stop stays fast. The `/craft-harness:verify` skill lives in
the plugin cache, outside this repository, and does not set that variable: the
orchestrator briefs the verifier to run `CRAFT_VERIFY_RENDER=1 bash .craft/verify.sh`
every time. A failed render is a **Blocking (P1)** finding, and the report quotes
the `render-smoke` line, file path included (the clip is kept in the OS temp dir, success or failure, so the path stays valid). CI runs the same script as a step of
the `Quality gate` job; the `Render the pull request` workflow cannot stand in for
it, since it is a demo that stays green when the render fails.

A journey that lands gets its spec: the proof you just ran by hand becomes a
Playwright test in `tests/e2e/` (one file per product promise, the promise in
its `describe`, waits on state and never on time, `@smoke` when it belongs in
the pull-request subset), so it runs again on every push and every night.
`pnpm e2e:smoke` and the touched spec are green before the report.

The hosted journeys (`pnpm e2e:hosted`, `tests/e2e/hosted/`) are part of the gate
for any change that can reach them: everything under `src/` except
`src/presentation/landing/`, `server/`, `cli/`, `scripts/`, `action.yml`,
`package.json`, `vite.config.ts` and `tests/e2e/hosted/` (the exact list is the
`changes` job in `ci.yml`). CI runs them as the "Hosted journeys" job on such pull
requests (`hosted-e2e.yml`, called from `ci.yml`) and every night on `main`
(`e2e-nightly.yml`). Locally, `tests/e2e/hosted/services.sh up` then
`pnpm e2e:hosted`. They are not a required check yet. Once they have been green
for a week, require **"Hosted gate"** (a job of `ci.yml`) next to "Quality gate"
in the `main` ruleset, never "Hosted journeys": that check is named differently
when it runs ("Hosted journeys / Hosted journeys") and when its path filter skips
it ("Hosted journeys"), so requiring it would hang every skipping pull request.
"Hosted gate" always runs, fails when the journeys fail, and passes when they
pass or are skipped.

**Pass:** the report names what was observed, with the command and the file,
the spec that now replays it, and what could not be verified and why.

### 6 Ship

`mattpocock-skills:code-review` runs on the diff since `main`, standards and
spec; a finding goes back to the gate that owns it. Then the orchestrator
commits with the decision log, updates the ticket (Project 4 column and
label), and asks Bruno for the merge. Before a release,
`emil-prep-for-prod` runs on the whole app and its "Needs a device" list goes
to Bruno as a checklist.

A change a person can see (a screen, a control, a sentence, an export, a public
page) adds an entry to `src/application/changelog/entries.ts` in the same pull
request: newest first, a permanent id, the day it ships, a one-line title and one
plain sentence (DECISIONS D13). The What's new card shows the latest three, so a
change with no entry leaves it stale, as it was after #289 to #312. The reviewer
checks it with the diff, and a change with nothing to see (a refactor, a test, a
gate, a doc) says so in the table below instead of adding one. The threshold: a new
screen, control, sentence, export or public page is an entry; a pixel alignment, a
spacing or a colour fix is not.

### PR body

Every pull request body, whoever writes it, has these parts in this order. Builders
read their brief, not this file, so the orchestrator's builder briefs point here.

1. **What**: two or three sentences, and the decision log it points to.
2. **Conformance**: one row per requirement of the ticket (its criteria, the
   design rules it touches), each with where it is met and what proves it (the
   test file, the spec, the screenshot). A deviation is a row too, marked
   **Deviates, logged**, with the log's name.

   | Requirement | Where | Proof |
   | --- | --- | --- |
   | (a criterion of the ticket) | (file or module) | (test, spec, capture) |
   | Changelog entry for a visible change | `application/changelog/entries.ts` (id, date) | the entry, or "nothing to see: a refactor" |
   | `bash .craft/verify.sh` | | OK |

3. **Notes** and **Evidence**: what a reviewer would trip on, and the captures
   with their paths.
4. `Closes #n`, then the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Roles

- **The orchestrator never edits product code.** It is Fable, or Opus while
  Fable's weekly limit is reached. It writes decision logs, briefs, tickets,
  memory and workflow docs, reviews reports, runs the gates once and commits.
- **No custom agents.** There is no `.claude/agents/` and no subagent
  definition. Work goes to the built-in agents with a model and a brief that
  names the skills of its gate.
- **Builders** run on Sonnet (`model: sonnet`): one ticket, one brief, their
  own ports, and a report in the four-part format: journeys, bugs, fixes with
  tests, not verifiable. A task Sonnet cannot finish goes to Opus
  (`model: opus`) with Sonnet's failure named in the new brief.
- **Explore agents** (Haiku, read-only) answer "where is X" with a report
  under 40 lines, so builders start editing on their first turn.
- **Tickets** are cut with `mattpocock-skills:to-tickets` and moved with
  `mattpocock-skills:triage`; see `issue-tracker.md` for Project 4.
- Writing rule for everything in the repo: no em-dashes. Comments say why.
