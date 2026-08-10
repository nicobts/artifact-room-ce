# 09 — API reference

Every route handler in the app, grouped by origin and trust level. Contracts reflect the code as
built. Origins are enforced by `proxy.ts` (see [Architecture](./02-architecture.md)).

Conventions:
- **Creator** endpoints require a BetterAuth session and run on the **app origin**.
- **Public** endpoints are unauthenticated, run on the **viewer origin**, and are designed to avoid
  enumeration (typed statuses, generic OK responses).
- Rate limits are in-process / SQLite-backed (`lib/rate-limit.ts`).

## Auth (app origin)

### `ALL /api/auth/*` — BetterAuth handler
`app/api/auth/[...all]/route.ts`. Login, signup, logout, session — delegated to BetterAuth
(`lib/auth.ts`). Email+password, min length 8. Signup may be gated by `SIGNUP_MODE` /
`SIGNUP_ALLOWLIST`. Sessions use host-only cookies; IP tracking is disabled.

## Creator — artifacts (authed, app origin)

### `POST /api/creator/upload`
Upload a new artifact. Accepts JSON `{ title, html }` or multipart file. Runs the scan-and-reject
pipeline, stores bytes via the blob interface, writes the `artifact` row.
- **201** `{ id, advisories, slideCount }`
- **422** on scan rejection (rule + reason)
- **Rate limit:** 30/hour per user, 60/hour per IP

### `DELETE /api/creator/artifacts/[id]`
Soft-delete an owned artifact (sets `deletedAt`). **200** / **404**.

### `POST /api/creator/artifacts/[id]/reupload`
Replace an owned artifact's HTML **in place** — same id/shares/tokens/analytics; fresh
`storageKey`, bumped `version`; identical scan pipeline; old blob retained for rollback.
- **200** `{ version, advisories, slideCount }` · **404** · **422** on scan rejection

## Creator — shares (authed, app origin)

### `POST /api/creator/shares`
Create a share of an owned artifact at one of four protection levels. The
stored `mode` / `password_hash` / `recipient_email` are derived from
`protection`, so invalid combinations are rejected rather than stored.
- **Body:** `{ artifactId, protection: "public"|"email"|"email_password"|"password", recipientEmail?, recipientLabel?, password?, expiresInDays? }`
- `recipientEmail` is **required** for `email`, `email_password`, and `password`
- `password` is **required** for `email_password` and `password`, and **rejected** for `public`
- **201** `{ id, token, url }` (the `url` points at the viewer origin)
- **400** invalid protection, or a combination the level does not permit
- **Rate limit:** 100/hour

### `POST /api/creator/shares/[id]/revoke`
Immediately revoke an owned share (sets `revokedAt`). **200** / **404**.

## Creator — preview (authed mint; token verify needs no session)

### `POST /api/creator/preview`
Mint a short-lived (~15 min), HMAC-signed preview URL for an owned artifact. Never creates a
`viewer_session` or `event`.
- **201** `{ url: "${VIEWER_ORIGIN}/preview/${token}" }` · **404** · **429**
- **Rate limit:** 120/hour

## Creator — notifications (authed, app origin)

### `GET /api/creator/notifications`
Last ~20 notifications for the creator, computed from `event` rows (owner-scoped). Fires a
fire-and-forget "email on first opens" if opted in. `cache-control: no-store`.
- **200** `{ items: [{ id, type, line, href, createdAt, unread }], unread }`

### `POST /api/creator/notifications/seen`
Upsert the `notificationsSeenAt` watermark in `creator_prefs`. **200**.

## Creator — admin (authed + `isAdmin`, app origin)

### `POST /api/creator/admin/takedown`
Instant takedown: revoke a share by `token` and/or soft-delete an `artifactId` (revoking all its
shares); optionally mark an abuse `reportId` actioned.
- **Body:** `{ token?, artifactId?, reportId? }` · **200** with the takedown result

### `POST /api/creator/admin/signatures`
Add a known-bad scanner signature (effective at next scan, no redeploy). **201** `{ id }`.

### `DELETE /api/creator/admin/signatures/[id]`
Remove a signature. **200** / **404**.

## Public — resolve & unlock (unauth, viewer origin)

### `POST /api/public/resolve`
Resolve a share token to artifact metadata. Every failure collapses to one
status — the endpoint must not reveal whether a token exists or which address
is registered against it.
- **Body:** `{ token, email?, password? }`
- **200** `{ status: "ok", share, artifact }` on success
- **200** `{ status: "denied" }` for every failure, including a gated share
  whose credentials were absent or wrong
- **Rate limit:** 120/minute per IP

### `POST /api/public/unlock`
Satisfy a share's gate (email, password, or both) and set the httpOnly,
host-only, signed access cookie (viewer origin only).
- **Body:** `{ token, email?, password? }` — supply whichever factors the share
  requires; the viewer shell is told which from the resolve result
- **200** `{ ok: true }` + `Set-Cookie: av_<shareId>`
- **401** `{ ok: false }` — **identical for every failure**: wrong password,
  wrong address, unknown token, revoked, expired, malformed body, or throttled.
  Do not add a reason field; that field is the vulnerability.
- **Rate limit:** 5/15 min per share token **and** 30/15 min per IP. Both are
  evaluated before any password hashing, so a throttled request cannot be
  distinguished from a wrong credential by response time.

## Public — analytics beacon (unauth, viewer origin)

### `POST /api/public/beacon`
Cookieless engagement ingest. Identity = `clientId` + share `token`; IP read transiently, never
persisted. ACKs immediately; writes behind via the buffer.
- **Body:** `{ token, clientId, events: [...] }` (persistable: `view`, `slide_view`, `dwell`)
- **202 / 204** on accept · **429** when throttled
- **Rate limit:** 600/minute per IP

## Public — abuse report (unauth, viewer origin)

### `POST /api/public/abuse-report`
No-account abuse reporting. Always returns a generic OK (even when throttled) to avoid enumeration.
- **Body:** `{ token?, reason?, details? }` · **200** `{ ok: true }`
- **Rate limit:** 10/hour per IP

## Viewer render routes (viewer origin)

### `GET /v/[token]/raw`
Re-authorizes (share access + password cookie), fetches artifact bytes, **injects the measurement
shim**, and returns under the strict **artifact CSP** (`connect-src 'none'`, `form-action 'none'`,
`nosniff`, `no-referrer`, `no-store`). `app/(viewer)/v/[token]/raw/route.ts`.

### `GET /preview/[token]`
Verifies the signed preview token (no session), serves artifact bytes **without** the shim (no
analytics), under the **preview CSP** (artifact CSP + `frame-ancestors ${APP_ORIGIN}` for in-console
embedding). `app/(viewer)/preview/[token]/route.ts`.

## Health probes (app origin)

### `GET /healthz`
Liveness — always **200**.

### `GET /readyz`
Readiness — **200** when DB + migrations + storage are ready, else **503**.
