# ADR: multimedia SaaS foundation

- Status: accepted and in implementation, with fenced PostgreSQL queues and a
  domain-owned Stripe adapter
- Date: 2026-08-30

## Context

Typelapse's differentiator is deterministic motion, but its persisted model is a
code snippet and its hosted capabilities are placeholders. The product needs to
compose several media types and support paid hosted value without sacrificing a
fully local workflow.

## Decision

1. Introduce a versioned `Project → Scene → Block → Asset` visual model plus
   global `Project → AudioCue → Asset` timing beside the legacy code model and
   migrate progressively. Audio cues are first-class content; they are not
   visual blocks or free-form editor tracks.
2. Compile projects into one pure render program consumed by all renderers.
3. Keep a modular Hono monolith plus a separate worker process from the same
   repository. Use Postgres for transactional state and S3-compatible object
   storage for bytes.
4. Separate deployment mode from commercial entitlement.
5. Put queue, storage, billing and identity providers behind narrow ports.
6. Preserve the local no-account path as a supported mode, not a degraded error.
7. Host jobs compile canonical project revisions server-side. Remote fallback is
   opt-in; hosted mode disables anonymous synchronous compute.
8. Ship Creator before Studio. Teams and seats are a separate capability slice.

## Consequences

- Existing code projects remain readable and magic move stays a specialized
  engine rather than becoming a generic block animation.
- Media bytes leave JSON, URL hashes and localStorage; local persistence uses
  IndexedDB and hosted persistence uses object storage.
- Hosted rendering can scale independently as a worker without premature
  microservices.
- Text/image rendering can ship before the riskier frame-exact video/audio
  adapters, but the domain and V2 document already model audio-only and mixed
  projects without a code or visual-scene requirement.
- Provider choices remain reversible, but renderer parity becomes a formal
  release gate.

## Rejected now

- Expanding `Step` with optional media fields.
- Rewriting to Next.js/Supabase or introducing Redis solely for a queue.
- Free-form multitrack editing in the first cut.
- Encoding media as data URLs in the project document.
- Using the current anonymous synchronous Remotion route as hosted production.
- Binding billing/tenancy to the Better Auth Stripe plugin by default.
