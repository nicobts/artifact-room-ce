# Security Policy

Artifact Room hosts and serves **untrusted, user-supplied HTML** to external viewers. Security is not a feature here — it is the product's load-bearing wall. We take reports seriously and we want to hear from you.

> Enable **GitHub Private Vulnerability Reporting** (Settings → Security → Private vulnerability reporting) as the primary channel.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Use one of:
1. **GitHub Private Vulnerability Reporting** — the "Report a vulnerability" button on the repository's Security tab (preferred).
2. Email **nicolasbossi@gmail.com** with details. Use the subject `SECURITY:` and, if possible, encrypt sensitive details.

Please include:
- A description of the issue and its impact.
- Steps to reproduce (a minimal artifact/HTML sample, a request sequence, or a PoC).
- Affected version / commit and deployment shape (self-hosted vs. demo).

We aim to acknowledge within **3 business days** and to provide a remediation timeline after triage. We will credit reporters who wish to be named once a fix ships, and we practice coordinated disclosure.

## What we consider in-scope (high priority)

The product's threat model centers on the untrusted-HTML surface and the two-identity boundary. We are especially interested in:

- **Sandbox / origin escapes** — an artifact reaching the parent shell, the viewer-origin storage/cookies, or any creator surface; the artifact obtaining a same-origin context.
- **CSP bypasses** — outbound data exfiltration despite `connect-src 'none'`, external form submission despite `form-action 'none'`, or loading disallowed external resources.
- **Identity-system conflation** — any path where a viewer obtains a creator session, or a creator session leaks onto the viewer origin.
- **Share-token weaknesses** — token guessability/enumeration, timing leaks, missing revoke/expiry enforcement, password-gate bypass.
- **Upload scanner bypass** that results in a stored, servable malicious artifact (note: the render-time sandbox is the backstop by design — but bypasses still matter).
- **Privacy violations** — raw IP or other PII persisted where the model says it must not be; analytics leaking across shares/recipients.
- **Rate-limit / takedown failures** — a revoke/takedown that does not actually pull all links.

## Out of scope

- Findings that require a malicious operator/self-hoster (the operator is trusted in the self-host model).
- Missing security headers on endpoints that carry no sensitive data, with no demonstrated impact.
- Denial of service from unrealistic volume against a single-container deployment (capacity is a known tradeoff; report only genuine amplification/asymmetric DoS).
- Automated scanner output without a demonstrated, reproducible impact.

## Supported versions

Until the first stable release, only the latest `main` and the most recent tagged release receive security fixes. This section will be updated to a version table at 1.0.

## Defense-in-depth, by design

Artifact Room never treats an upload as "trusted." Even scanned-clean HTML is served from a **separate origin**, inside a **sandboxed iframe** (opaque origin, no `allow-same-origin`), under a **strict CSP** with `connect-src 'none'` and `form-action 'none'`. Scanning is probabilistic; the sandbox is the guarantee. A bypass of any single wall is a valid, valued report even if the other walls would have contained it.
