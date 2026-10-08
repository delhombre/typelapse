# Kubernetes

Staging for Typelapse runs on the `craft-prod` cluster (Infomaniak), in the namespace `typelapse-staging`, at https://staging.typelapse.com. The data lives outside the cluster: Neon PostgreSQL, Cloudflare R2 and the Polar sandbox. The namespace, its quota and the deployer identity are created in the infra-infomaniak repo, not here.

One image, built from the root `Dockerfile`, runs as four workloads. Plain manifests, no Helm, no Kustomize. Placeholders like `__IMAGE_TAG__` are filled in by the workflow.

## Files in `staging/`

- `configmap.yaml`: the non-secret settings (hosted mode, URLs, Polar sandbox, R2 account and bucket).
- `api.yaml`: the API Deployment and its Service. It serves the SPA, `/api/*` and `/v/*` on one origin. Probe: `/health`.
- `ingress.yaml`: the host, TLS through `letsencrypt-prod`, an 8 MiB body limit and 60 s timeouts.
- `render-worker.yaml`: the hosted render worker. One replica, `Recreate`, an emptyDir for temp files and a memory-backed `/dev/shm`.
- `deletion-worker.yaml`: the R2 object deletion worker.
- `release-job.yaml`: runs `drizzle-kit migrate`, then the hosted readiness check. If either fails, the deploy stops before any Deployment changes. The workflow scales the three Deployments to zero first (the quota has no room for the Job next to them), so a failed release leaves staging stopped until a deploy succeeds.

The hostname is written once, as `APP_HOST` in `.github/workflows/deploy-staging.yaml`. Production can reuse the same manifests with `typelapse.com`.

## Prerequisites in the cluster

- The `ghcr-secret` image pull secret in the namespace. The workflow creates it if the `GHCR_PULL_TOKEN` secret is set; it is not needed once the package is public.
- DNS for `staging.typelapse.com` pointing at the ingress (Cloudflare, proxied).

## GitHub Environment `staging`

Secrets (names only, see `.env.staging.example` for where each value comes from):

- `KUBECONFIG_INFOMANIAK`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `TYPELAPSE_GITHUB_TOKEN` (optional)
- `GHCR_PULL_TOKEN` (optional)

Variables:

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `POLAR_CREATOR_MONTHLY_PRODUCT_ID`
- `POLAR_CREATOR_ANNUAL_PRODUCT_ID` (optional)
- `RENDER_MEMORY_REQUEST` and `RENDER_MEMORY_LIMIT` (wait for a measurement of a real render; the workflow refuses to deploy without them)

The workflow writes the secrets into the Kubernetes Secret `typelapse-env` from a temporary file and never prints them. Nothing secret is committed, not even encrypted.

## Deploy

Actions, "Deploy staging", Run workflow, on the branch you want to see running. It builds and pushes `ghcr.io/delhombre/typelapse:<sha>`, writes the Secret and ConfigMap, runs the release Job, applies the Deployments and waits for each rollout.

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
kubectl -n typelapse-staging rollout undo deployment/typelapse-render-worker
kubectl -n typelapse-staging rollout undo deployment/typelapse-deletion-worker
```

This restores the previous image. It does not undo a migration, and it keeps the current ConfigMap and Secret. To redeploy an older commit with matching settings, run the workflow on that commit instead.

## Quota

The namespace quota is provisional: requests 1Gi memory and 750m cpu, limits 2Gi memory and 2 cpu, with a LimitRange that requires requests and limits on every container. Every Deployment is `Recreate`, so no rollout needs a surge pod. The API takes 192Mi/384Mi and the deletion worker 96Mi/192Mi, which leaves at most 736Mi (request) and 1472Mi (limit) for the render worker, including its 128Mi `/dev/shm` volume. Set `RENDER_MEMORY_REQUEST` and `RENDER_MEMORY_LIMIT` inside that.

## Notes

- The R2 bucket needs a CORS rule for `https://staging.typelapse.com` (GET, PUT, HEAD and Content-Type): the browser uploads and downloads media straight from R2.
- On SIGTERM the render worker aborts the render in flight and cleans up, but does not release the lease. The job is picked up again when the lease expires (120 s by default).
