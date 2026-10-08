# Deploying the image

One Docker image, started as three processes. Nothing here depends on where it
runs: any host that can run a container, set its environment, run a command
before a rollout and probe an HTTP path will do.

## Build

```bash
docker build --platform linux/amd64 -t typelapse .
```

The build installs from the lockfile, runs `pnpm build` (types, then the Vite
bundle), downloads the headless browser Remotion renders with. It keeps the
development dependencies, which the release step needs (`drizzle-kit`). It
needs the network and no secrets.

Three things are baked into the client bundle, so they are build arguments, not
runtime variables:

| Build argument | Default | Hosted |
| --- | --- | --- |
| `VITE_TYPELAPSE_DEPLOYMENT_MODE` | `local` | `hosted` |
| `VITE_TYPELAPSE_AUTH_ENABLED` | `false` | `true` |
| `TYPELAPSE_APP_URL` | empty | the public origin, on HTTPS |

`TYPELAPSE_APP_URL` is also written into the share-card tags of the HTML, so an
image is tied to one public origin. Staging and production share the Dockerfile
and the commit, and share an image only if they accept the same share-card
origin. Pass `--build-arg` for each and tag the result per environment.

The image never contains a `.env`. Everything else is runtime configuration: see
`.env.example`.

## The three processes

Same image, same working directory (`/app`), a different command:

| Process | Command |
| --- | --- |
| API and the built app | `tsx server/index.ts` (the default) |
| Render worker | `tsx server/workers/hosted-render.entrypoint.ts` |
| Object deletion worker | `tsx server/workers/object-deletion.entrypoint.ts` |

`pnpm worker:render` and `pnpm worker:object-deletion` run the same two worker
files. The workers open no port. On SIGTERM the render worker aborts the render
in progress and does not release the job's lease, so the job is picked up again
once `TYPELAPSE_RENDER_LEASE_MS` (120 s by default) has run out. Give the process
a grace period of a few seconds, not a render's length. The image starts the
workers under `tini` so the signal arrives.

Both workers can also run as scheduled jobs, which is how staging runs them
(Kubernetes CronJobs, decision D8 of `docs/decisions/2026-10-08-staging.md`;
the manifests are in #235). See "Scheduled jobs" below.

The API listens on `PORT` (3001). With `TYPELAPSE_STATIC_ROOT` set, which the
image does (`/app/dist`), it also serves the built app, so one origin answers
`/`, `/app`, `/api/*`, `/v/*` and `/health`. Hashed files under `/assets/` are
cached for a year and immutable, HTML is `no-cache`, and an unknown path is a
404 (a browser asking for a page gets the app's own not-found screen with that
status). Unset the variable to run the API alone. The API sets no
Content-Security-Policy; put it on the ingress (issue #217).

## Scheduled jobs

Set `TYPELAPSE_WORKER_EXIT_WHEN_IDLE=true` on the job and the worker claims and
finishes work until a claim comes back empty, then closes its database pool and
exits with code 0. It never sleeps in that mode, so a run with nothing to do
ends at once: measured in the image, about 1 s from container start to exit,
and 45 ms from a render's success to the process exiting. Unset or `false`
keeps the polling loop. Any other value, an empty
one included, stops the worker at startup. SIGTERM behaves the same in both
modes.

A failed iteration (the database or the object store refused, or a render hit
`TYPELAPSE_RENDER_TIMEOUT_MS`) waits `TYPELAPSE_RENDER_FAILURE_MS` (or
`TYPELAPSE_OBJECT_DELETION_FAILURE_MS`) and tries again. In drain mode, three
failed iterations in a row end the run with code 1, so a broken dependency shows
as a failed Job instead of a pod retrying until its deadline. The long-running
loop has no such limit.

Three settings on the CronJobs:

- `concurrencyPolicy: Forbid`, required. Two runs at once are safe for the data,
  since each claim locks its job, but not for memory: each render run needs its
  own 2 GiB (see Sizing), and two do not fit the node.
- `activeDeadlineSeconds: 3600` on the render job. When the deadline is reached,
  Kubernetes sends SIGTERM: the worker aborts the render in progress, the job's
  lease is not released, and the job is picked up again by a later run once the
  lease has run out (`TYPELAPSE_RENDER_LEASE_MS`, 120 s). That attempt counts
  against `TYPELAPSE_RENDER_MAX_ATTEMPTS`. The deadline must therefore exceed
  `TYPELAPSE_RENDER_TIMEOUT_MS` (900 s) plus the time to drain the renders queued
  behind it, or it cuts renders that would have finished.
- `startingDeadlineSeconds`, for example 60 on the render job. A run that could
  not start in time (the previous one still holds the queue under `Forbid`) is
  dropped and the next schedule covers it. Without it, Kubernetes stops
  scheduling a CronJob once it has missed more than 100 start times.

## Release step

The workers must not run against a schema that is changing. Before each
rollout:

1. Suspend both worker CronJobs, so no new run starts:
   `kubectl patch cronjob <name> -p '{"spec":{"suspend":true}}'`.
2. Wait for the Jobs already running to end (`kubectl get jobs`). A render can
   take up to `TYPELAPSE_RENDER_TIMEOUT_MS`.
3. Migrate, then check, with the same environment as the API, and stop the
   rollout if either command exits non-zero:

   ```bash
   docker run --rm --env-file prod.env typelapse pnpm db:migrate
   docker run --rm --env-file prod.env typelapse pnpm hosted:check
   ```

4. Apply the new image and manifests.
5. Resume both CronJobs (`"suspend":false`).

The same two steps without pnpm, from `/app`:
`node_modules/.bin/drizzle-kit migrate` and
`node_modules/.bin/tsx server/config/hosted-check.entrypoint.ts`.
`db:migrate` applies the SQL migrations to `DATABASE_URL`.
`hosted:check` exits 1 and lists every capability the environment leaves
unavailable (auth, projects, private assets, billing, hosted rendering, API
keys). Run it with `TYPELAPSE_DEPLOYMENT_MODE=hosted`.

## Probe

`GET /health` on the API answers 200 with the deployment mode and the
capabilities that are on. Use it for both readiness and liveness. The workers
have no HTTP endpoint: probe them by process, and expect the render worker to
exit on a configuration error it names.

## Running constraints

- The image runs as uid and gid 1001 and needs no capability. Chromium starts
  with `--no-sandbox` and `--disable-dev-shm-usage`, both set by Remotion, so
  no `/dev/shm` mount and no `SYS_ADMIN` are needed.
- The render worker writes to three paths: `/tmp` (Chromium's profile),
  `TYPELAPSE_RENDER_TEMP_ROOT` (`/var/lib/typelapse/render`, one directory per
  job) and `/app/node_modules/.cache` (webpack's cache). With a read-only root
  file system, mount all three as volumes. Without the last, each render logs one
  `EROFS` warning and bundles cold; nothing fails.
- The default command runs under `tini`. If the host replaces `ENTRYPOINT`, `tsx`
  becomes PID 1 and still stops on SIGTERM (0.26 s, exit 143, measured), so
  either way works; setting only the arguments is simplest.
- `TYPELAPSE_RENDER_CONCURRENCY` is 1 in the image. Raise it only with the memory
  and CPU to match.

## Sizing

Measured on one render: the 20 second launch project (`docs/launch/launch.project.json`,
a V2 project) at 1920x1080, 30 fps, 600 frames, concurrency 1, in a container
limited to 2 CPUs and 4 GiB, as uid 1001 with no capability and a read-only
root file system.

| Host | Wall time | Peak working memory (`docker stats`) | cgroup `memory.peak` |
| --- | --- | --- | --- |
| linux/amd64, emulated on Apple silicon | 170 s | 1.52 GiB | 1.72 GB |
| linux/arm64, native (a lower bound, not the target) | 101 s | 1.62 GiB | 1.81 GB |

`memory.peak` counts file cache; the working-memory column does not. Plan 2 GiB
per render worker at concurrency 1. The amd64 time is inflated by emulation:
time it on a real node. The image is 1.20 GB uncompressed.
