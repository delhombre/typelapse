# Evidence log

## 2026-08-30 — baseline

- `pnpm test`: 86 files, 1,027 tests passed.
- `pnpm check-types`: passed (`tsc --noEmit`).
- `pnpm build`: passed; existing large-chunk warning remains.
- A concurrent test/typecheck/build run produced 17 false localStorage failures;
  the same suite passes when sensors run serially. Future acceptance sensors are
  therefore serialized.
- Auth/entitlement focused audit: 22 tests passed.

## Repository facts

- Better Auth + Neon/Drizzle and auth tables exist.
- Billing checkout/webhook and cloud job status are explicit placeholders.
- Product documents are unversioned and code-only; media bytes currently live
  only as small background data URLs.
- Three renderers must stay aligned: DOM/Remotion share React surfaces while the
  Canvas/WebCodecs painter is independent.

## 2026-08-30 — independent challenge adjudication

- Direction GO; initial sequence NO-GO until security and asset lifecycle moved
  earlier.
- Accepted: hosted compute gate now, deterministic V1 IDs, assets+sync as one
  vertical, canonical revision jobs, Creator-only first cut, cloud cost proof
  before pricing, UI-minimum per slice.
- Queue remains conditional on a disposable-Neon kill/retry spike.
- Better Auth Stripe plugin rejected by default to keep tenancy and webhook
  event projection domain-owned.

## 2026-08-30 — first implementation sensors

- Deployment-mode/security slice: 16 focused tests passed; server typecheck
  passed; real hosted boot returned `404` for `POST /api/render`, while local
  mode kept the validated route.
- Multimedia domain: 30/30 entity tests passed and the dependency-rule suite
  remained green.
- Project document boundary/hydration: 43 focused tests passed across assets,
  blocks, scenes, projects, V1/V2 validation and immutable hydration.
- Hosted project API contract: 6/6 tests passed for sign-in, V1 migration,
  owner isolation, CRUD validation and revision conflict.
- Legacy snippet import now consumes the extracted versioned parser and opens
  code-only V2 documents; its 53 relevant store/settings regressions passed.
- Client and server typechecks both passed before the PostgreSQL schema slice
  began writing its own RED tests.
# Storage compatibility correction

- Cloudflare documents direct presigned `PUT`/`GET` for R2 and requires browser
  CORS to allow every signed header:
  https://developers.cloudflare.com/r2/api/s3/presigned-urls/
  https://developers.cloudflare.com/r2/buckets/cors/
- R2's current S3 compatibility table does **not** support SHA-256 as a
  `FULL_OBJECT` checksum. It does support `Content-MD5` on `PutObject`, but MD5
  is not the canonical integrity identity in Typelapse:
  https://developers.cloudflare.com/r2/api/s3/api/
- Consequence: the upload URL binds content type and size; finalization streams
  the private object through the server and computes SHA-256 from the received
  bytes. A client-provided checksum or HEAD metadata is never accepted as proof.
- Binary media signatures are inferred from a bounded prefix with `file-type`
  rather than trusted from the filename or upload header; its documented
  `fileTypeFromBuffer` boundary accepts a leading Uint8Array/ArrayBuffer:
  https://github.com/sindresorhus/file-type
- Private read delivery is now owner-gated and short-lived. The focused
  ingestion/route/R2 suite passes 36/36 tests, including pending/foreign reads
  and a PDF payload disguised as PNG.

## 2026-08-30 — multimedia authoring and durable workers

- Strict V2 parsing, immutable hydration/serialization, generic scene/layer
  edits, uploaded-asset registration, timeline resolution and editor history:
  61 focused tests passed; client and server typechecks passed.
- Browser private-media path: 68 related client/server asset tests passed. SHA
  hashing is incremental, metadata probes clean up temporary object URLs, PUT
  progress is cancellable and no private URL/base64 enters project state.
- Asset deletion uses a transactional PostgreSQL outbox; 58 focused tests,
  migration checks and real PostgreSQL 16 migration/concurrency probes passed.
- Hosted render leases use `FOR UPDATE SKIP LOCKED`, fencing attempts,
  heartbeat CAS, lease recovery and bounded retries; 35 worker/repository/status
  tests passed. The V2 processor fails closed while concrete renderers remain
  code-only rather than publishing a false multimedia success.

## 2026-08-31 — real PostgreSQL/auth/project proof and final UI alignment

- Replaced the Neon HTTP-specific database adapter with Drizzle's standard
  node-postgres pool. Local PostgreSQL and managed providers now share one
  runtime path; provider pooling/TLS remain connection-URL concerns.
- A disposable `postgres:16-alpine` instance accepted all four migrations and
  exposed ten application/auth tables. Better Auth sign-up and persisted session
  succeeded against it.
- Real HTTP flow on the modular Hono server: unauthenticated project list `401`,
  create `201`, read/list `200`, optimistic update to revision 2, stale update
  `409`, session and project still `200` after server restart, and a second
  account received `404` for the foreign project.
- With PostgreSQL/Auth configured but no R2 or Stripe secrets, `pnpm
  hosted:check` failed closed and named exactly `privateAssets`, `billing` and
  `hostedRendering` as unavailable.
- At a 1512×950 viewport, the 5174 reference export canvas measured
  842.66×474px at x=334.67. The multimedia studio now measures 842.66×473.99px
  at the same x, instead of its previous 756×425px undersized stage.
- Axe on `/app`: zero automated violations; one contrast check remains manual
  because the scene number sits on a rendered thumbnail/gradient.
- Final serialized sensors: 181 test files / 1,569 tests passed, client and
  server type checks passed, Biome passed, and the production build passed. The
  existing large-chunk warning remains visible rather than being hidden.
