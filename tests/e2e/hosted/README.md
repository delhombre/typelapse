# Hosted journeys

The hosted profile, end to end: a hosted `vite build` behind `vite preview`,
the API in hosted mode, the real render worker (Remotion), PostgreSQL 16,
MinIO behind TLS and maildev, which catches the sign-in codes the API mails. In CI they are one reusable
workflow (`hosted-e2e.yml`, service containers for PostgreSQL and maildev, MinIO through `services.sh minio`),
called from `ci.yml` as "Hosted journeys" on pull requests that touch `server/`, `cli/`, the stores, the
multimedia and billing components, `src/application/billing/`, `tests/e2e/hosted/` or the workflows, and from
`e2e-nightly.yml` every night with no filter (also on demand).

## Run them

```sh
tests/e2e/hosted/services.sh up    # PostgreSQL on 54381, MinIO over TLS on 9181, maildev on 10281/10881
pnpm e2e:hosted                    # builds, starts API + worker + preview, runs
tests/e2e/hosted/services.sh down
```

`pnpm e2e:hosted` sets `E2E_PROFILE=hosted`; `pnpm e2e` never sees this folder.
Playwright runs `prepare.ts` (migrations, bucket) before the API, starts the
worker and the preview, and stops all three at the end. `E2E_SKIP_BUILD=1`
reuses the last hosted build.

The R2 adapter accepts only https endpoints, so `services.sh` makes a
self-signed certificate and the API, the worker and `prepare.ts` trust it
through `NODE_EXTRA_CA_CERTS`. Nothing in the product is loosened for tests.

Everything is overridable: `E2E_HOSTED_PORT` (5281), `E2E_HOSTED_API_PORT`
(3181), `E2E_PG_PORT` (54381), `E2E_MINIO_PORT` (9181), `E2E_SMTP_PORT` (10281),
`E2E_MAILDEV_PORT` (10881), `E2E_HOSTED_STATE` (certificate and render scratch),
`E2E_PG_CONTAINER`, `E2E_MINIO_CONTAINER`, `E2E_MAIL_CONTAINER`.

Signing in is a six-digit code by mail. The API sends it to maildev's SMTP, and
the helpers read it back from maildev's REST API (`GET /email`, the newest mail to
the address), then type it into the island or post it, as a person would.

## What each journey protects

- `billing.spec.ts`: checkout and the plan, through Polar. A visitor signs up, sees the
  two products' prices, starts an annual checkout (our account id goes to Polar as the
  external customer id), and a signed `subscription.active` event the journey posts to the
  local API makes the account Creator; Manage billing opens a portal session; a
  `subscription.past_due` event pauses Creator and the island says why and offers the
  portal, not a second checkout; `subscription.revoked` brings it back to free with the
  30 days of grace named and Creator for sale again; an unsigned or forged webhook is a
  400. Polar cannot call a laptop, so the delivery is ours and everything after it is the
  real route. With no `POLAR_SANDBOX_ACCESS_TOKEN` (environment or `.env`) it runs against
  `tests/support/fake-polar.ts`, a Polar API double the real SDK talks to over HTTP; with
  the token it runs against sandbox.polar.sh instead (the products are created through
  the API by `prepare.ts`) and pays on Polar's hosted checkout with the 4242 test card.
  `E2E_POLAR=fake` forces the double. The sandbox journey skips when the token cannot
  read or create the products.

- `account.spec.ts`: sign-up through the Studio's account island (the address, then
  the code read in maildev); signing up uploads nothing until "Save this project to cloud" is pressed (consent);
  the save writes one project row; the free allowance sentence is the
  server's own; the session and the cloud copy survive a reload.
- `cloud-under-where.spec.ts`: Cloud under Where in the three states (ux-waves D3).
  Signed out, the press opens the hosted render sheet, Escape gives focus back to
  Cloud, and signing in inside the sheet turns it into the Free view; on Free the
  sheet shows the server's allowance and one Upgrade to Creator that reaches Polar's
  checkout, and a render asked for anyway gets the 402 before its body; on Creator
  the press chooses Cloud. Nothing is saved or queued for a plan without renders.
- `device-export.spec.ts`: signed out, in the hosted build (which resolves the Free
  plan), a 4K export on this device comes out 3840x2160 with nothing stamped in the
  corner; the visitor's own watermark is the positive control for that measurement.
  What runs on the user's machine is free (decision 2026-10-13-device-exports-free).
- `cloud-render.spec.ts` (serial, one render feeds all three):
  - a Creator (flipped by SQL, the row a Polar webhook writes) submits a
    Cloud render, the status follows it, a reload mid-job resumes the same
    job, the download is an H.264 1920x1080 30 fps file of one second
    (ffprobe), Copy public link puts the page URL on the clipboard, a
    signed-out visitor gets the page with its Open Graph tags and a video
    that plays, Make private turns the page and its video into 404s;
  - tenancy: a second account, even a Creator, gets 404 on the job, its
    download, its publish switch and its page;
  - downgrade grace: just downgraded, the download and the public page still
    work; with the job and the downgrade dated past the grace period, the
    download is a 402 with the plan's sentence and the page is a 404.

- `api-keys.spec.ts` (one account, one sign-up): the island makes a key (shown
  once, copied, gone from the page, kept as a prefix and a hash); while the
  account is free the key signs it in and the plan refuses the render (402, not
  a 401); as a Creator the same key, from a caller with no cookie, starts a Cloud
  render and fetches the file; the key opens no account, billing, project, asset
  or key route; the island shows when it was last used; and once it is revoked
  the next request is the same 401 an unknown key gets.

- `render-by-url.spec.ts` (serial, no browser for the calls: a script holds only
  a key): a Creator's key and the repository's own diff queue one render at the
  size asked for (1280x720, 24 fps, read back with ffprobe) and save the project;
  the same request again is the same job and not a second project; the job is
  followed with the key until it is done, and its page is private until the key
  publishes it, then reachable by anyone; the studio link opens the same import
  in the studio. A free account's key gets the studio link and the reason, with
  no project and no job. An account at the month's minutes is refused with the
  ceiling it hit and nothing is created, while the render it already asked for
  still answers with its job. A text that is no source is refused, and a
  repository GitHub does not show (private or missing) is refused in plain words;
  that one is tagged `@network` and skips when GitHub cannot be reached.

- `github-action.spec.ts` (serial, no browser: the Action's own scripts run as a
  runner runs them, `cli/hosted-render.ts` then `cli/pr-comment.ts`, with a key in
  the environment): a Creator's key renders the repository's diff at 1280x720, 24
  fps in the nord theme, publishes the page, and leaves the share page and the
  studio link in the outputs; the page is reachable by anyone, the file is read
  back with ffprobe and its card is nord's colour and not midnight's, the saved
  project carries the theme, and the comment links the page with no artifact. The
  same run again is the same job and page. A free account's key leaves the runner
  to render, with the studio base for its link and the sentence that the hosted
  video comes with Creator, and nothing saved or queued; a key that is not valid
  is a warning and a line in the comment; no key and no address writes nothing,
  and an address without a key says so in the job summary.

- `rate-limit.spec.ts`: the two ceilings on sending a code. Scripts on ten other
  client addresses spend one address's ten codes an hour; the island's next ask for
  that address is refused, keeps the form with what was typed and says in one
  sentence how long to wait, using the seconds the server named in `X-Retry-After`,
  never "Cloud unavailable", and the same visitor still gets a code for another
  address. A script on the visitor's own address spends its ten codes in ten minutes,
  and the island's next ask, for any address, is refused the same way.

- `automation-projects.spec.ts` (one Creator, a script and a session): with a
  hundred regular projects in the table, a key renders a 101st source by URL and
  the project it saves takes no place; the studio's save of a 101st project is
  refused with the ceiling it hit; the allowance counts what the ceiling counts;
  saving the render-by-URL project from the studio is refused at the ceiling and
  writes nothing, and once a place is free the same save makes it regular, so
  that it counts.

- `delete-cloud-project.spec.ts` (one Creator render): the island lists the cloud
  copy of the open project, Delete asks with the shared question and one sentence
  on what goes, and keeping deletes nothing; deleting removes the project, the
  render and its public page (the page and its video answer 404), leaves a note
  for each file the render stored, and leaves the studio on its own project, on
  this device, with the render status saying the render is gone; a new save makes
  a new project. The month's minutes survive the delete: the island's allowance
  reads the same minutes before and after, and the next render over them is
  refused with the ceiling named. Another account's delete answers 404, as for a
  project that is not there.

`support/hosted.ts` holds the SQL (Creator, downgrade, ageing a job, the keys, the
projects, the minutes a render counts), the code reader and the sign-in helpers. Each
test account is its own visitor: its requests carry an `X-Forwarded-For` address of
its own (198.18.0.0/15, a benchmark range), which the preview's proxy passes on, so
the per-client ceilings count each journey apart instead of the whole suite as one
client.

## Reload with no edit (#127)

"a reload with no edit still reads Cloud copy saved, and writes nothing" was
pinned by `test.fail` until #127: the island fingerprinted the raw
composition, whose settings and live code stay as they were loaded, while a
reload rebuilds the saved document. It now fingerprints the document the
Studio saves, and the test asserts no project or asset write after the reload.
