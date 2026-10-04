# Hosted journeys

The hosted profile, end to end: a hosted `vite build` behind `vite preview`,
the API in hosted mode, the real render worker (Remotion), PostgreSQL 16 and
MinIO behind TLS. They run nightly and on demand (`e2e-nightly.yml`, job
"Hosted journeys"), never on a pull request.

## Run them

```sh
tests/e2e/hosted/services.sh up    # PostgreSQL on 54381, MinIO over TLS on 9181
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
(3181), `E2E_PG_PORT` (54381), `E2E_MINIO_PORT` (9181), `E2E_HOSTED_STATE`
(certificate and render scratch), `E2E_PG_CONTAINER`, `E2E_MINIO_CONTAINER`.

## What each journey protects

- `account.spec.ts`: sign-up through the Studio's account island; signing up
  uploads nothing until "Save this project to cloud" is pressed (consent);
  the save writes one project row; the free allowance sentence is the
  server's own; the session and the cloud copy survive a reload.
- `free-cloud.spec.ts`: a free account sees its allowance under Cloud; Render
  gets the 402 with the plan's sentence, and nothing is saved or queued.
- `cloud-render.spec.ts` (serial, one render feeds all three):
  - a Creator (flipped by SQL, the row a Stripe webhook writes) submits a
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

`support/hosted.ts` holds the SQL (Creator, downgrade, ageing a job) and the
sign-up helpers. Better Auth allows three sign-ups per ten seconds per client,
and behind the preview every journey is one client, so the helpers wait out a
429 instead of failing.

## Known bug, pinned by `test.fail`

"a reload with no edit still reads Cloud copy saved" fails today: after a
reload the local document differs from the saved one in `project.id` and
`legacySource.hadCapturedSteps`, so the island says "Cloud copy out of date".
The test turns red when the bug is fixed; then drop its `test.fail()`.
