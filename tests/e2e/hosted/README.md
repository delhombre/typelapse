# Hosted journeys

Empty on purpose. The journeys of the hosted profile (sign in, a Cloud render
through the queue and the worker, the stored project, the public `/v/<id>`
page) need PostgreSQL, MinIO and the render worker running beside the preview.
They land with ticket #118 and run in the nightly workflow only, never on a
pull request.

`playwright.config.ts` ignores this folder until then (`testIgnore`), so a spec
dropped here does not run by accident against a local build that has no
server behind it.
