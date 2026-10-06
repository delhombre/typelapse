# Pass: deleting a cloud project from the account island, 2026-10-05

## Screen

Ticket #149, decision log `docs/decisions/2026-10-05-next-wave.md` D9. Route
`/app` in a hosted build, both shells (the account island is the same component
in each), light and dark. A signed-in account lists what it keeps in Typelapse
Cloud and deletes a project behind the shared confirmation:

- The entry row and the view it opens (`multimedia/studio-account-control.tsx`,
  `multimedia/studio-cloud-projects.tsx` and `.css`), mounted by
  `layout/studio-account-island.tsx`.
- The shared question, `ui/confirm-discard.tsx`, which takes its own sentence
  and safe answer when the question is not about the snippet.

Out of scope: the panel's other views, the island's material (Open), and the
cloud save itself.

## Before

Nothing in the studio listed cloud projects: `HostedProjectApiPort.list` had no
caller, so a free account at its 3 projects, or a Creator at 100, had no screen
that showed which to delete. The view is new, so it has no before image; the
panel it hangs from is `shots/account-before-1440.png` (the row is already in
it). Everything is built from the keys view's own parts: its back button, rows,
notes, scroller and quiet buttons (`.mm-keys-*`), and `ConfirmDiscard`.

## Decisions

Foundations (`emil-design-foundations`):

- The list lives in the account panel as a third view, reached by a 44px row
  above "API keys" (cloud icon, "Cloud projects", chevron), as the keys are.
  A project chip menu would have meant accounts inside a local-only surface.
- One filled shape per zone (DECISIONS D2): inside the question it is "Delete
  project", the shared card's own fill. Delete and Keep are the card's two
  answers 8px apart, the shared layout, not a new pair.
- Copy is specific and one plain sentence: "Delete “Launch”?", "Its revisions,
  media, renders and their share pages go with it.", "Keep project", "Delete
  project", "Deleted Launch.". Empty: "No cloud projects yet. Save a project to
  the cloud from your account and it appears here." Refusals are sentences of the
  store's own ("The project could not be deleted. Try again in a moment.").
- The cloud copy of the open project says "Open now" where the others say their
  scene count, as the project menu does.

Forms and controls (`emil-forms-and-inputs`):

- Deleting asks once, in place, in the row, and the keyboard lands on the safe
  answer (`focusKeep`); Keep returns it to Delete; Escape means keep and does not
  close the panel; after a delete focus goes to the heading and a polite
  `<output>` says what went. While the request is open the row shows "Deleting…"
  on a disabled button, and a second delete is refused by the store.

Polish (`emil-ui-polish`):

- The question inside the panel is content, not a card inside a surface: no fill
  and no shadow, `padding: 6px 0 2px` (the source popover's rule, same reason).
- Hit areas are the keys view's (32px drawn, 44px with `::after`), and 44px
  answers under `pointer: coarse` from `.sc-confirm-actions`.
- "Deleting…" is wider than "Delete": `min-width: 70px; text-align: right` keeps
  one width and one right edge, so the title never loses a letter meanwhile.

Craft (`craft-design-engineering`):

- Scroll fades on the list (`useScrollEdges`, the keys view's rule as a hook):
  the edge with more fades, `--keys-fade-*` 0 to 18px in 200ms `var(--ease-out)`.
- A leaving row goes faster than it came: opacity to 0 in 120ms
  `cubic-bezier(0.4, 0, 1, 1)`, the rows beneath glide on `transform`
  (`layout="position"`, `springs.snappy`); an arriving row settles from `y` -6.
  Reduced motion: 0ms. The view arrives with the keys view's 160ms slide.
- `feedback("commit")` on a delete, `feedback("error")` on a refusal.

## After

`shots/` in the pass scratchpad (hosted build on 5241, throwaway PostgreSQL 16,
not committed): `list-1440-light.png`, `confirm-1440-light.png`,
`confirm-1440-dark.png`, `list-375-light.png`, `confirm-375-light-settled.png`.

Tests, red first, mutation-checked: `tests/presentation/studio-cloud-projects.test.tsx`
(9), `studio-cloud-project-delete.test.tsx` (4), `cloud-projects-store.test.ts`
(7), `confirm-discard-detail.test.tsx` (3), `hosted-render-jobs-store.test.ts`
(+3), `tests/application/cloud-project-labels.test.ts` (3); server:
`tests/server/project-delete-route.test.ts` (4) and
`project-delete.contract.test.ts` (7, PostgreSQL); the journey
`tests/e2e/hosted/delete-cloud-project.spec.ts`.

## Review verdict

`emil-ui-review`: **Approve with changes**. Should fix, done:

- "Deleting…" is wider than "Delete" and moved the row's title: the button keeps a width now.

Nits left: the destructive answer is the shared card's yellow fill, not the
keys view's outlined red (D2 wins, and the card is one component in five hosts);
the empty state has no button of its own (the back button is one tap away).

## Open

- The account panel is translucent over the stage on a phone: its 96% surface
  over a blur lets the stage's card show through behind rows of text, as the
  source menu did before next-wave D6. Not changed here (the panel is not this
  pass's surface); D6 should name it, owner the phone pass (#141).
- `(pointer: coarse)` cannot be driven in the headless emulation, so the 44px
  answers under a finger are proven by the rules that carry them.
- The list shows every cloud project, automation projects included; once #148
  exposes the kind in the summary a row could say "From a link".
