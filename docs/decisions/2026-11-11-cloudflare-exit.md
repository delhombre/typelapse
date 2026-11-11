# Staging leaves craft-prod for Cloudflare

Bruno, 2026-11-11: every project leaves the Infomaniak cluster (craft-prod) for
Cloudflare, one project at a time, then he switches the cluster off. The fleet
charter is in delhombre/mnemos.be#379 (Cloudflare first, adapters change and the
business code does not, one written naming convention, everything in the repo,
staging then production, migrations in CI, encrypted backups to R2 with a
replayed restore, a probe that really queries the base). Pica is the reference
(`pica/docs/runbooks/deploy.md`, ADR-0009, ADR-0010). Supersedes
[staging](2026-10-08-staging.md) D2, D7 and D8; D1 (one image) holds for the
render container only.

Read on 2026-11-11, read-only: the `typelapse-staging` namespace, the repo at
c58b532, Cloudflare Containers limits and pricing, Neon pricing.

## What runs today

| Workload | Shape | Requests / limits | Real behaviour | Native |
|---|---|---|---|---|
| API (Hono, serves the SPA too) | Deployment, **0 replicas since 2026-11-07** | 100m-500m, 192-384Mi | `tsx server/index.ts`, `@hono/node-server`, `pg` Pool, nodemailer, aws-sdk | none |
| render-worker | CronJob `* * * * *`, drain mode, Forbid | 500m-1, 1-2Gi, emptyDir 4Gi | wakes every minute, claims with `SKIP LOCKED`, 6 s when idle; one 20 s 1080p render is 100-170 s, peak 1.72-1.81 GB | Chrome Headless Shell, Remotion's own compositor (no apt ffmpeg) |
| deletion-worker | CronJob `*/15`, drain mode | 50m-250m, 96-192Mi | drains `object_deletion_outbox`, deletes R2 objects | none |
| release | Job per deploy | 100m-500m, 128-256Mi | `drizzle-kit migrate` then `hosted:check` | none |
| Base | `typelapse_staging` on the shared Postgres (`data`) | | 10 migrations, PL/pgSQL, transaction-scoped advisory locks, `SKIP LOCKED`, jsonb | |
| Files | already on R2, bucket `typelapse-staging` | | | |
| Mail | `SMTP_URL` (nodemailer), from `code@typelapse.com` | | | |
| Billing | Polar **sandbox** | | | |

There is no production anywhere: only `staging.typelapse.com`, deployed by hand
(`deploy-staging.yaml`, `workflow_dispatch`). The base holds test data only.

## D1 The API becomes a Worker

**Decision:** the Hono app runs on Workers (Paid, already paid by Pica on the
same account), the SPA as Workers static assets with the Worker first on `/api/*`
and `/v/*`. A new Worker entry, not a rewrite: the routes and use cases do not
change. Four adapters change behind their existing seams:

- `pg` Pool built once in `createApp` → a client per request through Hyperdrive
  (Pica lost connections to a module-level client: `write CONNECTION_ENDED`).
- nodemailer behind `MailPort` → Cloudflare Email Service binding, Resend over
  HTTP kept as the fallback until deliverability is measured, then removed.
- object operations → R2 binding. Presigned URLs still need the S3 keys
  (a binding cannot presign), so the S3 presigner adapter stays.
- the static host: the Worker runs first on every page route too, reads
  `index.html` from the assets binding and writes each page's head from the
  [route-head](2026-10-14-route-head.md) table, as the Node host does today; an
  unknown path keeps its real 404. Cloudflare's single-page-application fallback
  is not used, since it would serve the landing's tags on `/pricing` with a 200.
- the in-memory auth rate limit (#65) → a Durable Object through Better Auth's
  `secondaryStorage`; `cf-connecting-ip` is native, which closes #241.

The Worker bundle must not pull Remotion: the local-only render routes stay out
of the Worker entry, and CI checks the bundle size (10 MB compressed on Paid).

**Why not a Container for the API:** an always-on `basic` is about 7 $ a month
for a staging nobody uses, and a sleeping one puts a cold start on the public
path, which Pica rejected (ADR-0009).

**Pivot:** "Run the API in a Container."

## D2 The render worker becomes a Container, woken by a Queue

**Decision:** the render worker runs unchanged (same image, same drain
entrypoint) as a Cloudflare Container `standard-2` (1 vCPU, 6 GiB, 12 GB disk).
Postgres stays the queue of record: `SKIP LOCKED`, leases and the attempt fencing
token are already there and do not move. The Queue only carries a **wake signal**:

- after the API enqueues a render, a new `RenderWakeupPort` adapter sends one
  message to the queue; its consumer starts the Container singleton. A duplicate
  wake is a no-op when the container already runs (Queues are at-least-once).
- the drain exits on its first idle claim, so a job waiting on `retryAt` would
  wait for the next wake. After each run that left work pending (a count query in
  the consumer, not in business code) the consumer re-sends the wake with
  `delaySeconds`.
- a lost wake or an expired lease is caught by the hourly Cron Trigger (D4).

**Why standard-2:** the measured peak (1.8 GB) rules out `basic` (1 GiB);
`standard-1` fits the memory but halves the CPU, and since memory is billed on
the provisioned size for the whole run, the slower render costs more. CPU is
billed on active use only.

**Cost per render** (Containers pricing read 2026-11-11: 0.0000025 $/GiB-s,
0.00002 $/vCPU-s active, 0.00000007 $/GB-s disk): about 0.0000358 $/s, so
0.4 ct for 100 s and 0.6 ct for 170 s. The 25 GiB-h included per month are per
account and Mnemos' always-on API container uses them, so they are not counted.
About 4 to 6 $ per 1,000 renders.

**Unmeasured, settled by the spike (#ticket below) before any adapter:** image
size and first-pull cold start (likely tens of seconds, irrelevant for an
asynchronous render), that a 15-minute render survives `sleepAfter` (no requests
reach the container while it renders), that the process exit really stops
billing, the render time on Cloudflare's amd64, and whether `cf/config` declares
Containers and Queues (`wrangler.jsonc` otherwise). A Container cannot use a
Hyperdrive binding: it reaches Neon's pooled URL with `sslmode=verify-full`
(every advisory lock is transaction-scoped, so a transaction pooler is fine).

**Deploy constraint:** `compilerVersion` is the commit SHA, so the Worker and the
Container land from the same SHA in one deploy, or queued jobs fail with
`compiler-version-mismatch`. Matching SHAs does not save jobs queued under the
previous SHA: a job waiting on `retryAt` or behind an expired lease is claimed
after the deploy and fails with that reason, which is today's behaviour on the
cluster (`infra/kubernetes/README.md:110`) and stays, because the fencing is
business code. The deploy job narrows the window instead: before switching, it
waits, bounded, until no render is pending or running; a job that still lands
across the switch fails visibly and the owner renders again (the enqueue is
idempotent). A redeploy does not replace a running container's code (Mnemos
spike #381): the same wait covers it.

**Pivot:** "Keep a render worker that is always on." (the base then never
sleeps: Neon's paid tier, D3)

## D3 The base goes to Neon Free, one project per environment

**Decision:** Neon Free, `aws-eu-central-1`, project `typelapse-staging` now and
`typelapse-production` later (CU-hours are counted per project). D1 is not an
option: the schema relies on PL/pgSQL functions, advisory locks, `SKIP LOCKED`
and jsonb path queries. Supabase Free is full (Pica holds both projects).

**The arithmetic that sets every schedule:** 100 CU-h per project per month, the
compute sleeps after 5 minutes idle, and if the idle compute is 0.25 CU (the low
end in Neon's examples; the Free page does not state it) that is about 400 hours
awake out of 730. The spike's Neon reading confirms or corrects these figures. Today's per-minute render poller keeps the base awake all month
(about 182 CU-h): Neon would suspend the compute around day 16. Every 15 minutes
(today's deletion worker) keeps it awake a third of the time (about 61 CU-h).
**No poller survives the move.** Everything that touches the base on a schedule
shares one hourly Cron Trigger (D4) plus the daily backup: about 15 CU-h, leaving
the rest for real traffic.

**Pivot:** "Pay Neon by usage." (about 19 $ a month if the base never sleeps)

## D4 One hourly Cron Trigger does the scheduled work

**Decision:** one `0 * * * *` handler in the API Worker drains the deletion
outbox (R2 binding behind `ObjectDeletePort`, the outbox repository unchanged),
sends a render wake when jobs are pending or leases expired, and is the probe
that really queries the base: on failure it mails an alert, with the alert state
in KV (Pica's availability job). An external 5-minute probe hits `/health`,
which does not touch the base, so it never wakes Neon.

**Pivot:** "Drain the deletions every 15 minutes." (about 61 CU-h a month, D3)

## D5 Data, backups, migrations

- Migrations run in a CI job before the deploy (`drizzle-kit migrate` against
  the direct Neon URL); never at start-up.
- Readiness checks the deployed Worker, not the CI runner: `hosted:check` today
  reads the runner's environment (it would fail without `SMTP_URL` and pass with
  a binding missing). It becomes a check that the new version reports every
  hosted capability enabled (auth, mail through its binding, billing, storage,
  render wake), run against the Worker before the deploy is promoted.
- Backups: a GitHub Actions `pg_dump`, encrypted with age, to R2
  `typelapse-staging-backups`, daily; a weekly workflow restores the latest into
  a throwaway base. The age private key exists only as the GitHub `staging`
  environment secret, so a restore runs as a `workflow_dispatch` job.
- The current base is test data (Polar sandbox), nothing to keep legally. It is
  still restored into Neon from the platform's last encrypted export, so the R2
  objects keep their rows and the production move is rehearsed; per-table counts
  are compared on both sides.

**Pivot:** "Start staging on an empty base."

## D6 Naming

Pica has no written rule; this one is written before any resource exists.
`<project>-<environment>-<role>`, the environment dropped in production, the role
dropped for the Worker itself.

| Resource | Staging | Production |
|---|---|---|
| Worker (API, SPA, crons, queue consumer) | `typelapse-staging` | `typelapse` |
| Container application | `typelapse-staging-render` | `typelapse-render` |
| Queue | `typelapse-staging-render-wakeups` | `typelapse-render-wakeups` |
| R2, files | `typelapse-staging-media` | `typelapse-media` |
| R2, backups | `typelapse-staging-backups` | `typelapse-backups` |
| Hyperdrive | `typelapse-staging-db` | `typelapse-db` |
| KV, alert state | `typelapse-staging-alerts` | `typelapse-alerts` |
| Neon project | `typelapse-staging` | `typelapse-production` |
| Mail sender | `code@mail.typelapse.com` | same |

Bindings are upper snake case by role (`DB`, `MEDIA`, `BACKUPS`, `RENDER`,
`RENDER_WAKEUPS`, `ALERTS`, `EMAIL`, `RATE_LIMITS`). The existing bucket
`typelapse-staging` breaks the rule: its objects are copied to
`typelapse-staging-media`, then the old bucket is deleted on Bruno's go.

## D7 Order, and what is Bruno's

1. This decision and the runbook skeleton.
2. Spike: the render Container, measured, then deleted and listed.
3. Neon project, Hyperdrive, age key, backups and restore workflows.
4. Adapters, test first: per-request database, Email Service, R2 binding,
   rate-limit Durable Object, render wake.
5. The Worker entry (API, SPA, hourly cron) and the render Container with its
   queue consumer, deployed to `typelapse-staging.<account>.workers.dev`.
6. Data: restore the export into Neon, copy the bucket, compare counts.
7. Cut-over: the platform's pilot session runs `tofu state rm` on
   `cloudflare_dns_record.typelapse_staging[0]` (nobody applies from
   `infra-infomaniak` meanwhile), then `staging.typelapse.com` moves to the
   Worker on Bruno's go; the hosted journeys pass against it (#302, #71).
8. Clean-up: `infra/kubernetes/`, the k8s steps of `deploy-staging.yaml`, the
   GHCR pull secret and unused variables go; the Mnemos session is told that
   typelapse has left the cluster.

Bruno keeps: a Cloudflare API token scoped to Workers, Containers, Queues, R2,
Hyperdrive, KV and Email Service on the account and the zone; one Neon login if
the connector cannot create the project; the go for the `mail.typelapse.com`
DNS records, for the `staging.typelapse.com` switch, and for every deletion
(old bucket, GHCR image, cluster resources).

## Cost

Before: typelapse's share of the 21.40 EUR a month of the cluster cannot be
separated (its quota is about a third of the memory requests), and nothing is
saved until all four projects have left. After, on staging: Workers Paid already
paid, Neon Free, Queues, KV, Email Service and R2 inside their included amounts,
renders at 0.4 to 0.6 ct each. **About 0 $ a month while staging is quiet.**
