# Triage labels

The Matt Pocock skills use five canonical triage roles. Their tracker labels in
this repository are:

| Skill role | GitHub label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | A maintainer must evaluate the issue |
| `needs-info` | `needs-info` | More information is required from the reporter |
| `ready-for-agent` | `ready-for-agent` | Fully specified and safe for an autonomous agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation or judgment |
| `wontfix` | `wontfix` | Will not be actioned |

Category labels are GitHub's defaults: `bug` and `enhancement`. Every triaged
issue carries exactly one category and one state.

Severity, when it matters, goes in the title prefix the QA campaign already
uses: `P1` (blocks a journey or a sale), `P2` (wrong but survivable), `P3`
(polish). The project's Status column mirrors the state label; see
`issue-tracker.md`.
