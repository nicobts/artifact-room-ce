# 07 — Feature catalog

Design is agreed before code: substantial changes start as an issue, not a pull
request. This page is the catalog of what exists and its build status.

**Status legend**

- ✅ **Shipped** — implemented, tested, documented.
- 🟩 **Built** — working code in the tree; documentation still catching up.
- 📝 **Planned** — designed, not yet implemented.

## Core MVP capabilities

| # | Capability | What it delivers | Status |
|---|---|---|---|
| 1 | `setup-project` | Single-container skeleton: Next.js + TS + Drizzle + BetterAuth + Tailwind/shadcn, Docker, single-volume layout, the two-origin wiring, and the Vitest + Playwright harnesses. | ✅ |
| 2 | `ci-and-supply-chain` | CI pyramid (lint/typecheck/unit/integration/e2e), CodeQL, advisory gate, GHCR release with SBOM + build provenance, `SECURITY.md`. | ✅ |
| 3 | `core-schema` | The data spine — `artifact / share / viewer_session / event` (+ scaffolded `comment`, `email_gated`) and the share-token primitives. | ✅ |
| 4 | `creator-auth` | BetterAuth email+password sign-up/in/out, server-side route protection for `(creator)`, dashboard shell. Creators only. | ✅ |
| 5 | `artifact-upload` | Authenticated, provider-agnostic HTML ingest (paste/drop), **scan-and-reject** gate, blob storage interface (disk), upload rate limiting, advisory flags. | ✅ |
| 6 | `shares-public-and-recipient` | Token create/resolve, `public` + `recipient` modes, optional password, optional expiry, revoke, resolution rate limiting. | ✅ |
| 7 | `viewer-render-sandbox` | Render from the **separate viewer origin** in a sandboxed iframe under strict CSP, plus the unbranded measurement channel. | ✅ |
| 8 | `analytics-engagement` | Cookieless beacon + injected shim, per-slide dwell, reopen + forwarding detection, identified per-recipient dashboard — **the moat**. | ✅ |
| 9 | `ops-hardening` | Litestream backups, `/healthz` + `/readyz`, graceful shutdown (buffer flush + DB close), structured redacting logs. | ✅ |
| 10 | `abuse-takedown` | Public abuse-report intake (rate-limited, no enumeration), instant takedown, signature-list management. | ✅ |

## Post-MVP enhancements (schema was already ready)

| Capability | What it delivers | Status |
|---|---|---|
| `recipient-drilldown` | Per-share drill-down: recipient totals, per-slide dwell funnel, session timeline, forwarding events. | ✅ |
| `artifact-detail` | Artifact metadata (size, scan advisories, version) + aggregated analytics recap across shares + recent-events feed. | ✅ |
| `artifact-preview` | In-console preview via a stateless signed token, sandboxed on the viewer origin, with **no** share/analytics pollution. | ✅ |
| `console-visual-identity` | The console's distinct visual identity — Ivory / Navy / Ember palette and display type. | ✅ |
| `creator-console-ux` | The real console experience: overview dashboard, analytics surface, clean navigation, real signed-in user. | ✅ |
| `artifact-versioning` | Re-upload replaces an artifact's HTML **in place** while preserving id, shares, tokens, and analytics history; bumps `version`. | 🟩 Built (`lib/artifacts.ts:reuploadArtifact`, `POST /api/creator/artifacts/[id]/reupload`, `artifact-replace.tsx`). |
| `open-notifications` | In-app notification bell — feed of noteworthy events (first open, reopen, forwarding), unread watermark, optional email digest. | 🟩 Built (`lib/notifications.ts`, `GET/POST /api/creator/notifications`, `notifications-bell.tsx`). |

## The four protection levels

One token mechanic. The creator picks a **protection level**; the stored
`share.mode`, `password_hash`, and `recipient_email` are derived from it, so
invalid combinations cannot be created.

| Protection | Viewer must supply | Stored `mode` | Status |
|---|---|---|---|
| `public` | nothing | `public` | ✅ |
| `email` | the registered address | `email_gated` | ✅ |
| `email_password` | the address **and** a password | `email_gated` | ✅ |
| `password` | a password (the link is per-recipient) | `recipient` | ✅ |

**Expiry** applies to any protection; **revoke** is immediate at every level.

> **The email gate identifies; it does not authenticate.** The viewer types an
> address and it is compared against the one the *sender* registered. Anyone who
> knows or guesses that address can open the link — there is no proof the person
> controls the inbox. Use `email_password` when that matters, and treat `email`
> as attribution rather than access control. A verified (magic-link) gate is a
> later upgrade.

Every unlock failure — wrong address, wrong password, unknown token, revoked,
expired, or rate-limited — returns one identical response. This is deliberate:
anything finer lets a caller enumerate which tokens exist and which addresses
are registered against them.

### Legacy shares

Two combinations the pre-protection API allowed can still exist. They keep
working and are shown honestly rather than rewritten into a policy the creator
never chose:

| Stored shape | Shown as |
|---|---|
| `recipient` with no password | `link-only (legacy)` |
| `public` with a password | `password, no recipient (legacy)` |

## Explicitly deferred (post-MVP, schema-ready)

- Verified email gate (magic link) — the current gate is typed-match only.
- Identified, slide-anchored **comments** on `recipient` / `email_gated` shares (never anonymous
  public shares).
- Sender notifications beyond the in-app bell (e.g. Slack).
- Team roles / audit logs / custom domains (managed-tier features).
- Postgres + S3 migration; managed cloud offering.
- Translations beyond the single-locale scaffold.

## Explicit non-goals

Viewer accounts of any kind · being a general static host · consumer-volume monetization ·
provider branding in rendered artifacts · third-party analytics. See [Overview](./01-overview.md).
