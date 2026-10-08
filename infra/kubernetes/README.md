# Kubernetes

Staging for Typelapse runs on the `craft-prod` cluster (Infomaniak), in the namespace `typelapse-staging`, at https://staging.typelapse.com. The database is the cluster's shared PostgreSQL; media is in Cloudflare R2 and billing in the Polar sandbox. The namespace, its quota and the deployer identity are created in the infra-infomaniak repo, not here.

One image, built from the root `Dockerfile`, runs as three workloads: the API, a render worker and an object deletion worker. Plain manifests, no Helm, no Kustomize. Placeholders like `__IMAGE_TAG__` are filled in by the workflow.

## Files in `staging/`

- `configmap.yaml`: the non-secret settings (hosted mode, URLs, Polar sandbox, R2 account and bucket, worker drain mode).
- `api.yaml`: the API Deployment and its Service. It serves the SPA, `/api/*` and `/v/*` on one origin. Probe: `/health`.
- `ingress.yaml`: the host, TLS through `letsencrypt-prod`, an 8 MiB body limit and 60 s timeouts.
- `render-worker.yaml`: the hosted render worker, a CronJob (every minute, `Forbid`, applied suspended). Memory 1Gi request, 2Gi limit; the low `typelapse-render-low` priority class; an emptyDir for per-job render files.
- `deletion-worker.yaml`: the R2 object deletion worker, a CronJob (every 15 minutes, `Forbid`, applied suspended), without a priority class because the pod is small and short-lived.
- `release-job.yaml`: runs `drizzle-kit migrate`, then the hosted readiness check.

CPU figures, so the quota in infra can match: API 100m request / 500m limit, render pod 500m / 1000m, deletion pod 50m / 250m, release Job 100m / 500m.

The hostname is written once, as `APP_HOST` in `.github/workflows/deploy-staging.yaml`. Production can reuse the same manifests with `typelapse.com`.

## Preconditions, applied from infra-infomaniak before the first deploy

- The namespace `typelapse-staging` with its quota: requests memory 1536Mi, limits memory 3Gi, requests cpu 750m, limits cpu 2, and a LimitRange that requires requests and limits on every container.
- The deployer ServiceAccount `deploy-typelapse` and its kubeconfig.
- The PriorityClass `typelapse-render-low`. The render CronJob references it and its pods will not schedule without it.
- The database `typelapse_staging` in the shared PostgreSQL, and its role.
- DNS for `staging.typelapse.com` pointing at the ingress (Cloudflare, proxied).

The `ghcr-secret` image pull secret is not one of them: the workflow creates it from `GHCR_PULL_TOKEN` and fails before the build if that secret is missing, because the image is private while the repository is. Once the package is public, set `GHCR_PACKAGE_PUBLIC` to `true` and the token is no longer needed.

## GitHub Environment `staging`

Secrets (names only, see `.env.staging.example` for where each value comes from):

- `KUBECONFIG_INFOMANIAK`
- `DATABASE_URL` (the in-cluster PostgreSQL, no pooler)
- `BETTER_AUTH_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `TYPELAPSE_GITHUB_TOKEN` (optional)
- `GHCR_PULL_TOKEN` (required while the repository is private: a classic personal access token with only `read:packages`)

Variables:

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `POLAR_CREATOR_MONTHLY_PRODUCT_ID`
- `POLAR_CREATOR_ANNUAL_PRODUCT_ID` (optional)
- `GHCR_PACKAGE_PUBLIC` (optional; set to `true` once the package is public, to stop requiring `GHCR_PULL_TOKEN`)

The workflow writes the secrets into the Kubernetes Secret `typelapse-env` from a temporary file and never prints them. The kubeconfig is written to a temporary file, its token is masked, and the file is removed at the end of the run. Nothing secret is committed, not even encrypted.

## Deploy

Actions, "Deploy staging", Run workflow, on the branch you want to see running. In order, the workflow:

1. builds and pushes `ghcr.io/delhombre/typelapse:<sha>`;
2. writes the Secret and the ConfigMap;
3. suspends both worker CronJobs and waits, for at most 20 minutes, until no worker Job is unfinished;
4. runs the release Job and stops if it fails, cannot pull its image or takes more than 11 minutes;
5. applies the API, the CronJobs (still suspended) and the Ingress, and waits for the API rollout;
6. runs each worker once from its CronJob as a smoke test (an empty queue exits 0 in seconds) and deletes those Jobs;
7. resumes the CronJobs. This is the only step that does.

The Secret and the ConfigMap are applied before the release Job, so a failed release leaves them updated. Any failure after step 3 leaves the workers suspended, and the API on whatever it was running, until a later deploy succeeds. The API keeps running during the release.

## Read the release Job logs

The workflow prints the Job, its pods, the last 30 events and its logs when the Job fails. To read them later:

```
kubectl -n typelapse-staging logs job/typelapse-release
kubectl -n typelapse-staging describe job typelapse-release
```

The Job is kept until the next deploy deletes it.

## Roll back

Run the workflow again on the previous commit. `kubectl rollout undo` does not work with the deployer identity: its Role has no access to ReplicaSets. A rollback does not undo a migration.

## Quota arithmetic

The API is `Recreate` because of `limits.cpu`: the API (500m), the render pod (1000m) and a deletion pod (250m) already use 1750m of the 2 allowed, so a surge pod does not fit. Worker pods never overlap with themselves (`Forbid`).

| Pod | Memory request / limit |
| --- | --- |
| API | 192Mi / 384Mi |
| render | 1Gi / 2Gi (measured peak 1.72 to 1.81 GB for a 1080p render) |
| deletion | 96Mi / 192Mi |
| release Job | 128Mi / 256Mi |

The requests of API, render and deletion add up to 1312Mi, under the 1536Mi quota. The limits add up to 2624Mi, under 3Gi. The release Job runs with the workers suspended and idle, next to the API only.

## Workers on demand

A worker pod exists only while there is work: every minute (render) or 15 minutes (deletion) the CronJob starts one, it drains the queue and exits, and an empty queue exits in seconds (`TYPELAPSE_WORKER_EXIT_WHEN_IDLE`). A new render therefore waits up to a minute for its pod to start.

## Notes

- The R2 bucket needs a CORS rule for `https://staging.typelapse.com` (GET, PUT, HEAD and Content-Type): the browser uploads and downloads media straight from R2.
- On SIGTERM the render worker aborts the render in flight and cleans up, but does not release the lease. The job is picked up again when the lease expires (120 s by default).
- `TYPELAPSE_COMPILER_VERSION` is the commit SHA, so every deploy is a new compiler version. A render job queued across a deploy can fail with `compiler-version-mismatch`, and renders finished before the deploy are rendered again.
- Postgres connections: each process opens a `pg.Pool` of up to 10 connections (the default). The API, a render pod, a deletion pod and the release Job can overlap, and the shared server allows `max_connections` 60 in total across all apps.
