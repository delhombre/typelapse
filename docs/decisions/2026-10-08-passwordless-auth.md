# Passwordless sign-in: a six-digit code by mail

Bruno, 2026-10-08, before proving #71 on staging: "Pour le auth, je pense
qu'un magiclink ou un code envoyé par mail est mieux. Un peu comme polar",
and maildev in a dev compose file to test mail locally. Opus decides as CTO
and PO with Fable's advice. Rewrites #234 (mail port), touches
[staging](2026-10-08-staging.md) D6 and #65.

```mermaid
flowchart TD
  D1["D1 Sign-in is a six-digit code sent by mail; no password"]
  D2["D2 Mail leaves through SMTP behind a MailPort"]
  D3{"D3 Mail is a required hosted capability"}
  D4["D4 The sign-in form follows the forms checklist"]
  D1 --> D2 --> D3 --> D4
```

## D1 Sign-in is a six-digit code sent by mail; no password

**Decision:** Better Auth's `emailOTP` plugin carries both sign-up and
sign-in: the person types an address, receives a six-digit code valid ten
minutes with three tries, and the session opens. `emailAndPassword` is
turned off. Sending a code is rate limited per address and per IP. The
error never says whether an address exists.

**Why:**

- A code works when the mail is read on the phone and typed on the laptop.
- Corporate mail scanners open links before the person does and burn a
  magic link; the DevRel teams of #77 sit behind exactly those scanners.
- No password means no reset flow, no breach to leak and one less form.

**Rejected:**

- A magic link, for the two reasons above.
- Keeping passwords beside the code: two ways in, twice the abuse surface.
- GitHub OAuth now: it comes with the GitHub App, later.

## D2 Mail leaves through SMTP behind a MailPort

**Decision:** a `MailPort` in the domain and one nodemailer SMTP adapter in
infrastructure. Locally, `maildev` in `compose.dev.yaml`; the hosted e2e
suite reads codes from maildev's API. On staging, any SMTP provider Bruno
picks (Resend, for example) sending from `typelapse.com`; its DNS records go
through `infra-infomaniak`.

**Why:**

- Three mails a month do not justify marrying the code to a provider's SDK.
- The same adapter serves maildev, staging and production.

## D3 Mail is a required hosted capability

**Decision:** `/health` reports `mail`, and `hosted:check` fails without an
SMTP configuration. Staging turns red until Bruno's SMTP is set, on purpose:
without mail nobody can sign in.

**Why:**

- A hosted build that cannot send the code is a hosted build nobody can
  enter; the release check must say so before a deploy, not after.

## D4 The sign-in form follows the forms checklist

Bruno, 2026-10-08: the inputs had no placeholder, and had `emil-forms-and-inputs`
been applied? Mostly; about nine rows changed (the PR's table lists them) and are fixed.

**Decision:** both fields carry an example (`you@company.com`, `123456`) in the
label's muted ink, the labels stay; the address asks for the email keyboard and
no capitalisation; the code is kept from password managers. A cursor lands in
the address when the form opens, a finger never gets its keyboard raised: on a
phone the code step moves focus to its heading instead, so a screen reader
lands on what changed. A field is checked when it is left, except on a press
on the form's own button (a message above the button would move it between
press and release and lose the click) and when focus leaves for nowhere in the
panel. A refused field shows a mark beside its message (border, mark and words,
not colour alone), announced as a status when it appears, and every button of
the form takes the 0.97 press. Busy buttons stay `aria-disabled`, not
`disabled`. "Use another email" returns focus to the address on a finger too:
the person is about to type, so raising the keyboard there is right.

**Why:**

- `disabled` drops the focus the button holds to the page; the press guard
  already prevents the second request, which is the checklist's purpose.

**Rejected:**

- A segmented six-slot code field: it fights paste and one-time-code autofill.
- Clearing the server's refusal on the next keystroke: it needs a store
  action, and the refusal sits in its own slot under the button without
  moving anything.

## Consequences

- #71 waits: its journey starts with sign-up, which changes shape here.
- #65 moves earlier: the auth rate limit is now the only defence of an
  endpoint that sends mail, so the trusted-proxy posture (Cloudflare, then
  ingress-nginx, then the pod) is due before staging opens to anyone but
  Bruno.
