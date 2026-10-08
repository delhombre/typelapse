# Kubernetes

Staging for Typelapse runs on the `craft-prod` cluster (Infomaniak), in the namespace `typelapse-staging`, at https://staging.typelapse.com. The database is the cluster's shared PostgreSQL; media is in Cloudflare R2 and billing in the Polar sandbox. The namespace, its quota and the deployer identity are created in the infra-infomaniak repo, not here.

One image, built from the root `Dockerfile`, runs as four workloads. Plain manifests, no Helm, no Kustomize. Placeholders like `__IMAGE_TAG__` are filled in by the workflow.

## Files in `staging/`

- `configmap.yaml`: the non-secret settings (hosted mode, URLs, Polar sandbox, R2 account and bucket).
- `api.yaml`: the API Deployment and its Service. It serves the SPA, `/api/*` and `/v/*` on one origin. Probe: `/health`.
- `ingress.yaml`: the host, TLS through `letsencrypt-prod`, an 8 MiB body limit and 60 s timeouts.
- `render-worker.yaml`: the hosted render worker, a CronJob (every minute, `Forbid`). A 2Gi memory limit, the low `typelapse-render-low` priority class and an emptyDir for per-job render files.
- `deletion-worker.yaml`: the R2 object deletion worker, a CronJob (every 15 minutes, `Forbid`), without a priority class because the pod is small and short-lived.
- `release-job.yaml`: runs `drizzle-kit migrate`, then the hosted readiness check. If either fails, the deploy stops before anything is applied. The workflow suspends both worker CronJobs first and waits (at most 20 minutes) for their running pods to finish, so a failed release leaves the workers suspended until a deploy succeeds. The API keeps running during the release.

The hostname is written once, as `APP_HOST` in `.github/workflows/deploy-staging.yaml`. Production can reuse the same manifests with `typelapse.com`.

## Prerequisites in the cluster

- The `ghcr-secret` image pull secret in the namespace. The workflow creates it from `GHCR_PULL_TOKEN` and fails before the build if that secret is missing, because the image is private while the repository is. Once the package is public, set `GHCR_PACKAGE_PUBLIC` to `true` and the token is no longer needed.
- The PriorityClass `typelapse-render-low`, created in the infra repo. The render worker pod references it and will not schedule without it.
- DNS for `staging.typelapse.com` pointing at the ingress (Cloudflare, proxied).

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
- `RENDER_MEMORY_REQUEST` (the render worker's memory request; the workflow refuses to deploy without it. The limit is fixed at 2Gi)

The workflow writes the secrets into the Kubernetes Secret `typelapse-env` from a temporary file and never prints them. Nothing secret is committed, not even encrypted.

## Deploy

Actions, "Deploy staging", Run workflow, on the branch you want to see running. It builds and pushes `ghcr.io/delhombre/typelapse:<sha>`, writes the Secret and ConfigMap, suspends the worker CronJobs, runs the release Job, applies the manifests, waits for the API rollout and resumes the CronJobs.

## Read the release Job logs

The workflow prints them when the Job fails. To read them later:

```
kubectl -n typelapse-staging logs job/typelapse-release
kubectl -n typelapse-staging describe job typelapse-release
```

The Job is kept until the next deploy deletes it.

## Roll back

```
kubectl -n typelapse-staging rollout undo deployment/typelapse-api
```

The CronJobs have no rollout history: to roll the workers back, run the workflow on the older commit.

This restores the API's previous image. It does not undo a migration, and it keeps the current ConfigMap and Secret. To redeploy an older commit with matching settings, run the workflow on that commit instead.

## Quota

The namespace quota is provisional and owned by the infra repo, with a LimitRange that requires requests and limits on every container. The API is `Recreate`, so no rollout needs a surge pod. Worker pods are short-lived and never overlap with themselves (`Forbid`). Memory: API 192Mi/384Mi, deletion pod 96Mi/192Mi, render pod `RENDER_MEMORY_REQUEST` (1Gi) / 2Gi (measured peak 1.72 to 1.81 GB for a 1080p render), release Job 128Mi/512Mi. The requests quota has to cover the API plus the render pod plus a deletion pod (about 1.3Gi) and the limits quota the same sum of limits (about 2.6Gi).

## Workers on demand

A worker pod exists only while there is work: every minute (render) or 15 minutes (deletion) the CronJob starts one, it drains the queue and exits, and an empty queue exits in seconds (`TYPELAPSE_WORKER_EXIT_WHEN_IDLE`). A new render therefore waits up to a minute for its pod to start.

## Notes

- The R2 bucket needs a CORS rule for `https://staging.typelapse.com` (GET, PUT, HEAD and Content-Type): the browser uploads and downloads media straight from R2.
- On SIGTERM the render worker aborts the render in flight and cleans up, but does not release the lease. The job is picked up again when the lease expires (120 s by default).
