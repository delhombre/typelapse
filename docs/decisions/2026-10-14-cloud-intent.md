# The Cloud intent: a deep link to the hosted render sheet

Builder on #290, 2026-10-14, after [hosted-render-sheet](2026-10-13-hosted-render-sheet.md)
(#254, #279) and [pricing-page](2026-10-13-pricing-page.md) (#256). Carries out
[ux-waves](2026-10-12-ux-waves.md) D3 (the paid side visible to everyone) for a visitor who
has not opened the studio yet.

```mermaid
flowchart TD
  D1["D1 The hash answers after the session is read"] --> D2["D2 One sheet, no opener"]
  D1 --> D3["D3 One link, two copies"]
```

## D1 The hash answers after the session is read

**Decision:** `/app#cloud` is taken once on arrival by `CloudIntentBoot`, the way
`#import=` is (`takeCloudIntent` scrubs the hash before anything async). The answer
is a pure function of `cloudGate` (`cloudIntentAction`, `application/billing/cloud-intent.ts`):
signed out or Free, open the sheet; Creator, choose Cloud and open nothing; a local
build, nothing. While the session is being read or a signed-in account's plan is not
read, it waits. After ten seconds it opens the sheet anyway, which has words for both
("Checking account…", "Checking your plan…"). A `hashchange` on an open studio is
followed, as the import's is. No haptic: a link is not a press.

**Why:** `cloudGate` says "sign-in" for a session not read yet, so answering at once
would flash the signed-out offer at a Creator and close it a few hundred ms later. The
sheet's own effect would have closed it; the flash is what the wait removes.

**Rejected:** opening at once and letting the sheet correct itself (the flash).
Waiting forever (a link that does nothing is worse than a sheet that says it is checking).

**Impact:** `cloud-intent.ts` (application and `presentation/utils`), `cloud-intent-boot.tsx`,
`studio-route.tsx`, `useCloudAccount` in `cloud-render.tsx`, `tests/application/cloud-intent.test.ts`,
`tests/presentation/cloud-intent-boot.test.tsx`, `tests/e2e/hosted/cloud-intent.spec.ts`.

**Pivot:** "Open the sheet on the first render and let the plan close it."

## D2 One sheet, no opener

**Decision:** the sheet is the stage's (`surface "stage"`, #284), the one mounted with the
frame on every shell, and it opens with `opener: null`. Closed, focus falls back as #284
defined: this surface's Cloud under Where if it is on screen, else the island's Export
trigger. Nothing in the sheet's focus or Escape code changed. `#cloud` is no arrival
payload: the stored draft is still restored and the loading outline draws the draft's mode.

**Why:** the cluster and the rail sheets belong to an export panel that may be closed;
the stage's does not. No editor is requested: on a phone the code sheet stays at its stop
(#214 holds).

**Pivot:** "Open the Export panel first, then its sheet."

## D3 One link, two copies

**Decision:** the pricing page's Creator action links to `/app#cloud` in both of its states
(`CLOUD_INTENT_PATH`, carried by `pricingView().creator.action.to`). A priced catalog says
"Start a hosted render" and "Opens the studio on Cloud"; any other says "See Creator in the
studio" and "Opens the studio". The "choose Cloud under Where" sentence is gone: the link
does the choosing.

**Why:** a call to action that ends in instructions is a weak one (#290). Without a price
the page promises no hosted render, so the words stay neutral; the destination is the same
because the sheet says honestly what the account can do.

**Pivot:** "Link to /app only when the catalog has no price."
