# 05 — Security model

Security is the **load-bearing wall**, not a follow-up. Artifact Room accepts and serves *untrusted
user HTML*, so a feature that serves or accepts HTML is not "done" until its CSP/sandbox/scanning
story ships in the same change. This page describes the controls as implemented.

See also `SECURITY.md` (disclosure policy) at the repo root.

## Threat model in one line

Anonymous-ish upload of arbitrary interactive HTML is a phishing/malware magnet, and **one Google
Safe Browsing flag can kill every link on the domain.** The design assumes uploads are hostile and
layers defenses so no single probabilistic check is load-bearing.

## Layer 1 — Authenticated ingest (no anonymous upload)

Upload requires an authenticated creator (signed-up or invited). There is **no anonymous ingest
endpoint**. Signup itself can be gated: `lib/signup-gate.ts` reads `SIGNUP_MODE` (`open` | `invite`)
and, in invite mode, checks `SIGNUP_ALLOWLIST`. Enforced in BetterAuth via a `user.create.before`
database hook (`lib/auth.ts`).

## Layer 2 — Scan-and-reject at the gate

Every uploaded HTML is scanned **before** it is stored; failing uploads are rejected, never
persisted. Orchestrated by `lib/scan/index.ts` → `scanHtml(bytes, html)`, fail-closed, early-return:

1. Content-type must be `text/html`.
2. Size ceiling (≈5 MB).
3. Looks-like-HTML heuristic.
4. **External form action** (credential-harvest POST) → reject.
5. **Meta-refresh to external URL** → reject.
6. **Obfuscation patterns** (e.g. `eval`+`atob`, `eval`+`unescape`, dynamic DOM-write +
   `unescape`, `eval`+`String.fromCharCode`, large base64 blobs) → reject.
7. **Known-bad signatures** — substring match against `DEFAULT_SIGNATURES` + the admin-managed
   `abuse_signature` list (`lib/scan/signatures.ts`).
8. **Google Safe Browsing** lookup on outbound URLs (`lib/scan/safe-browsing.ts`, v4
   `threatMatches:find`). **Fail-open** on network/API error and **no-op without an API key**, so
   uploads never hard-depend on Google and CI stays deterministic.

Non-blocking **advisories** (recorded on the artifact, not rejected): `uses-storage-apis`,
`external-subresources`, `safe-browsing-skipped`. Helpers live in `lib/scan/heuristics.ts` and
`lib/scan/urls.ts`.

> Scanning is probabilistic. It reduces the hit rate; it is **not** the guarantee. The sandbox is.

## Layer 3 — Origin isolation + sandbox + CSP (the guarantee)

Even scanned-clean HTML is always served from a **separate viewer origin**, inside a **sandboxed
iframe**, under a **strict CSP**. There is no such thing as a "trusted" upload.

- **Separate origin.** `proxy.ts` guarantees artifacts render only on `VIEWER_ORIGIN` and are
  `404` on `APP_ORIGIN` (see [Architecture](./02-architecture.md)).
- **Sandboxed iframe.** `components/viewer-frame.tsx` mounts
  `<iframe src="/v/<token>/raw" sandbox="allow-scripts">` — an **opaque origin**, deliberately
  **without** `allow-same-origin`.
- **Strict CSP.** Built in `lib/csp.ts` and set on the raw artifact response
  (`app/(viewer)/v/[token]/raw/route.ts`):

  | Directive | Artifact CSP | Why |
  |---|---|---|
  | `default-src` | `'none'` | Deny by default |
  | `script-src` | `'unsafe-inline' 'self'` (+ optional CDN allowlist) | Inline is safe under an opaque origin; needed for self-contained artifacts |
  | `style-src` | `'unsafe-inline' 'self'` (+ allowlist) | Same rationale |
  | `img-src` / `font-src` / `media-src` | `'self' data: blob:` (+ allowlist) | Passive subresources |
  | **`connect-src`** | **`'none'`** (unconditional) | Kills data exfiltration (fetch/XHR/WebSocket) |
  | **`form-action`** | **`'none'`** (unconditional) | Kills credential-harvest POST |
  | `frame-ancestors` | `'self'` | Only embeddable on the viewer origin |
  | `base-uri` | `'none'` | |

  The two real weaponization channels — `connect-src` and `form-action` — are shut
  **unconditionally**. Passive external subresources (CDN
  scripts/styles/fonts/images) are **blocked by default** and degrade gracefully (the artifact
  still renders, plus a safety notice — never a blank page). A self-hoster may opt into a curated,
  read-only allowlist via `VIEWER_CDN_ALLOWLIST`.

Response headers on the raw artifact also include `x-content-type-options: nosniff`,
`referrer-policy: no-referrer`, and `cache-control: no-store`.

### Two adjacent CSP variants

- **Shell CSP** (`buildShellCsp`) — the viewer *page* (not the artifact). Trusted first-party;
  allows `connect-src 'self'` so the shell can POST to `/api/public/*`, and `frame-src 'self'` to
  embed the raw iframe.
- **Preview CSP** (`buildPreviewCsp`) — identical to the artifact CSP except
  `frame-ancestors ${APP_ORIGIN}`, so a creator can preview their own artifact embedded in the
  console. Preview serves **without** the measurement shim, so it never pollutes analytics.

## Layer 4 — Token & access-control security

Share tokens (`lib/share-token.ts`):

- **High entropy:** `randomBytes(32).toString("base64url")` → 256-bit, well above the ≥128-bit floor.
- **Opaque random, not signed/JWT** — deliberate: revocation is a single row update with no
  signing-key rotation.
- **Constant-time comparison** (`timingSafeEqualToken`).
- **Revocable and optionally expiring** (`isShareUsable`, `revokeShare`).

Access control (`lib/share.ts`): `resolveShare(token, password?)` fails closed on not-found /
revoked / expired / password-mismatch and returns a **typed status** so responses don't leak which
condition failed (no enumeration). Password shares are hashed with scrypt (`lib/password.ts`); the
password gate sets an httpOnly, host-only, HMAC-signed access cookie scoped per share
(`lib/viewer-access.ts`), verified again on the raw artifact route.

Creator preview tokens (`lib/preview-token.ts`) are stateless, HMAC-signed, short-lived (≈15 min),
verified constant-time; ownership is enforced at mint time and they never create a `viewer_session`
or `event`.

## Layer 5 — Rate limiting + revoke on every public endpoint

Every public-facing ingest/share endpoint ships with rate limiting **and** a revoke path in the
same change. Rate limiting is in-process / SQLite-backed (no Redis — single container),
implemented as a fixed window in `lib/rate-limit.ts` over the `rate_limit` table. Representative
limits (see [API reference](./09-api-reference.md) for the full list):

| Endpoint | Limit |
|---|---|
| `POST /api/creator/upload` | 30/hour per user, 60/hour per IP |
| `POST /api/creator/shares` | 100/hour |
| `POST /api/public/resolve` | 120/minute per IP |
| `POST /api/public/unlock` | 30/minute per IP |
| `POST /api/public/beacon` | 600/minute per IP |
| `POST /api/public/abuse-report` | 10/hour per IP |

## Layer 6 — Abuse takedown

`abuse-takedown` adds public, no-account abuse reporting (`POST /api/public/abuse-report`, always
returns a generic `{ok:true}` to avoid enumeration), plus admin controls: instant takedown
(`adminTakedown` — revoke a share by token and/or soft-delete an artifact and revoke all its shares)
and signature-list management (`lib/abuse.ts`). Admin routes check `isAdmin(session.user)` — a
server-set `user.role` column; `ADMIN_EMAILS` is only a promote-only bootstrap applied at boot.

## Privacy controls (a feature, not overhead)

- **Cookieless analytics.** Viewer identity is a first-party `clientId` in viewer-origin
  `localStorage` + the share token — no cookies on the beacon path.
- **No raw IP at rest.** IP is read transiently for rate-limiting only; corroboration is a hashed
  UA + accept-language signal.
- **Log redaction.** `lib/log.ts` (pino) auto-redacts token, password, passwordHash,
  authorization, cookie, email, and IP fields.
- **BetterAuth IP tracking disabled** and cookies host-only, so creator sessions never write IPs
  or leak onto the viewer origin.

## Security invariants (never crossed)

1. Untrusted HTML is **always** sandboxed (separate origin + sandboxed iframe + strict CSP). No
   rendering user HTML on the app origin. No "trusted upload" exception.
2. Upload is authenticated; no anonymous ingest endpoint exists.
3. `connect-src 'none'` and `form-action 'none'` on artifacts are unconditional.
4. No anonymous open comment boxes on public shares (comments are identified-only, post-MVP).
5. Every public ingest/share endpoint is rate-limited and revocable before it ships.
