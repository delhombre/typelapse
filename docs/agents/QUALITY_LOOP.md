# Quality loop

Every unit of work (a feature, a fix, a screen, a refactor) runs these gates
in order, so an agent can work alone and the owner only reads and pivots. Each
gate ends on a **pass condition** you can check. A feeling of being done is
not a pass. Skills are named as installed; prefix `mattpocock-skills:` when a
bare name does not resolve.

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
run the `research` skill or a sub-agent and cite what it found under
`docs/research/`. Apply Pstack **Foundational Thinking** before writing logic:
core types, what concurrent actors share.

**Pass:** the decision log opens with its three context lines, naming the
ticket and the D-numbers it touches.

### 1 Grill

Run the `grilling` skill against your own plan, and play both sides. Build the
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
term), run `domain-modeling` for the language and `codebase-design` for the
module shape and its seams, with Pstack **Model the Domain**, **Boundary
Discipline** and **Type System Discipline**. Otherwise write "no domain
change" in the log.

**Pass:** new terms are in `CONTEXT.md`, and the log lists the seams gate 3
will test.

### 3 Build

Run `tdd` at the seams from gate 2: one test, seen red, then the least code to
make it green, one slice at a time. For a bug, run `diagnosing-bugs` first so
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
journey is proven in a real browser (`agent-browser`, own ports, restart the
dev server after every source edit). An export is proven with `ffprobe` on
the downloaded file and a frame compared with the preview. A hosted flow is
proven against a disposable PostgreSQL. Do not run the full `pnpm test` while
another agent runs anything in the same worktree; the orchestrator runs the
full suite, `pnpm build` and `pnpm lint` once, serially, before a commit.

**Pass:** the report names what was observed, with the command and the file,
and what could not be verified and why.

### 6 Ship

The orchestrator commits with the decision log, updates the ticket (Project 4
column and label), and asks Bruno for the merge. Before a release,
`emil-prep-for-prod` runs on the whole app and its "Needs a device" list goes
to Bruno as a checklist.

## Roles

- **Fable orchestrates and never edits product code.** It writes decision
  logs, briefs, memory and workflow docs, reviews reports, runs the gates
  once and commits.
- **Explore agents** (Haiku, read-only) answer "where is X" with a report
  under 40 lines, so builders start editing on their first turn.
- **Builders** (Opus) take one ticket, one brief, their own ports, and report
  in the four-part format: journeys, bugs, fixes with tests, not verifiable.
- Writing rule for everything in the repo: no em-dashes. Comments say why.
