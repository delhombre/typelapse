# Security policy

## Reporting a vulnerability

Email security@REPLACE-BEFORE-OPENING with a description, the steps to
reproduce, and the impact you expect. Please do not open a public issue for a
vulnerability.

You will get an acknowledgement within a few working days, and we will keep you
informed until the issue is fixed. We are happy to credit you in the release
notes if you want. There is no bug bounty.

## Scope

In scope:

- The hosted profile: accounts and sessions, private projects, private media
  and signed storage access, billing and entitlements, the hosted render queue
  and its workers.
- The render routes: the local synchronous render endpoint and the hosted
  render API, including anything a crafted project document can make the
  renderer fetch, read or execute.

Out of scope:

- Findings that need a compromised machine or a malicious browser extension.
- Denial of service through volume alone, and missing rate limits without a
  demonstrated impact.
- Vulnerabilities in third-party dependencies with no path through Typelapse;
  report those upstream.

## Supported versions

Only the latest release and `main` receive security fixes.
