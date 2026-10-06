# Issue tracker: GitHub

Issues and specifications for this repository live in GitHub Issues for
`delhombre/typelapse`, mirrored in GitHub Project 4 "Typelapse"
(https://github.com/users/delhombre/projects/4). Use the `gh` CLI from this
clone so the repository is resolved from `origin`.

## Conventions

- Create: `gh issue create --title "..." --body "..." --label "..."`, then add
  it to the project: `gh project item-add 4 --owner delhombre --url <issue url>`.
- Read: `gh issue view <number> --comments` and include labels.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

The project's Status column follows the triage label, so a label change and a
column move are one operation, never two states that disagree:

| Status column | Triage label |
| --- | --- |
| À trier | `needs-triage` |
| En attente de toi | `needs-info`, `ready-for-human` |
| Prêt pour un agent | `ready-for-agent` |
| En cours | an agent or Bruno has claimed it |
| Fait | merged on `main` |

Move an item with `gh project item-edit --project-id PVT_kwHOAxv7R84BlksT
--id <item id> --field-id PVTSSF_lAHOAxv7R84BlksTzhkRB8A --single-select-option-id <option>`
where the option ids are: À trier `630d707f`, En attente de toi `6874be7c`,
Prêt pour un agent `c393bf95`, En cours `a4b46b4a`, Fait `515a978c`.

The orchestrator, acting as Product Owner since 2026-10-03, creates,
labels and moves tickets as part of its job. Agents move a ticket to "En
cours" when they start and report back; they never close a ticket, since
closing follows the merge on `main`, which stays Bruno's call.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub issues and pull requests share one number space, so resolve an
ambiguous `#42` with `gh pr view 42` before falling back to `gh issue view 42`.

## Skill mappings

- "Publish to the issue tracker" means create a GitHub issue and add it to
  Project 4.
- "Fetch the relevant ticket" means run `gh issue view <number> --comments`.
- Blocking edges use GitHub's native issue dependencies ("Blocked by") when
  available, else a `Blocked by: #<number>` line in the body.

## Wayfinding

For `/wayfinder`, use one issue labelled `wayfinder:map` as the map and link
child issues with GitHub sub-issues. Child labels use `wayfinder:research`,
`wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
