# 02 — Architecture

Artifact Room runs as **one small Next.js 16 (App Router) process** that serves **two distinct
origins** and enforces **two identity systems that never touch**. Those two ideas are the entire
architectural spine; everything else hangs off them.

## The two identity systems (never conflated)

| | **Creators** | **Viewers** |
|---|---|---|
| Identity | BetterAuth session (a real account) | An unguessable **share token** in the URL — no account, ever |
| Optional | — | Captured/verified email (email-gated mode only; post-MVP) |
| Purpose | Upload & manage artifacts, see analytics | Be identified-*without*-login so analytics attribute correctly |
| Code home | `lib/auth.ts`, `lib/session.ts`, `app/(creator)` | `lib/share.ts`, `lib/share-token.ts`, `app/(viewer)` |

**Absolute rule of the architectural spine:** a viewer NEVER gets an account. The two
systems share no code, no session, and no table join that treats a viewer as a user. In code this
is enforced structurally:

- Creator session helpers in `lib/session.ts` are marked `server-only` and live behind
  `requireCreator()`, the chokepoint used by `app/(creator)/layout.tsx`.
- `app/(viewer)` must never import creator/session helpers.
- BetterAuth cookies are **host-only** (no cross-subdomain cookies), so a creator session cannot
  leak onto the viewer origin.

## The two origins (physical isolation of untrusted HTML)

Untrusted user HTML is **never** rendered on the app origin. Artifacts render only from a separate
**viewer origin** (a dedicated host/subdomain), inside a sandboxed iframe, under a strict CSP.

```
                         ┌───────────────────────────────────────────┐
   Browser request  ───► │            One Next.js process             │
   (Host header)         │                                            │
                         │   proxy.ts routes by Host + path:          │
                         │                                            │
   app.example.com  ───► │   APP_ORIGIN  → (auth) (creator) /api/*    │
                         │                 dashboard, upload, shares   │
                         │                                            │
   view.example.com ───► │   VIEWER_ORIGIN → (viewer) /v/* /preview/* │
                         │                   /api/public/*            │
                         └───────────────────────────────────────────┘
```

### How routing is enforced — `proxy.ts`

`proxy.ts` is the Next.js 16 **proxy convention** (the successor to `middleware`). It classifies
each request by Host header and path and fails closed:

- **Viewer origin** may serve only viewer paths (`/v/*`, `/preview/*`, `/api/public/*`); anything
  else → `404`.
- **App origin** may **never** serve `/v/*` or `/preview/*` (untrusted render paths) → `404`.

This means even a bug in route grouping cannot cause an artifact to render on the app origin.

## Route map (App Router)

```
app/
├── layout.tsx                       root layout (fonts, Toaster)
├── page.tsx                         marketing / landing page
│
├── (auth)/                          unauthenticated — app origin
│   ├── login/page.tsx
│   └── signup/page.tsx
│
├── (creator)/                       authenticated console — app origin
│   ├── layout.tsx                   requireCreator() guard + sidebar shell
│   ├── dashboard/page.tsx           overview: cards, recent activity, top artifacts
│   ├── artifacts/page.tsx           artifact list + uploader
│   ├── artifacts/[id]/page.tsx      artifact detail: preview, metadata, shares, recap
│   ├── artifacts/[id]/shares/[shareId]/page.tsx   recipient drill-down
│   ├── analytics/page.tsx           views time-series, forwarding alerts, shares table
│   └── admin/page.tsx               abuse reports, takedown, signatures (admin-only)
│
├── (viewer)/                        public, token-gated — VIEWER ORIGIN ONLY
│   ├── layout.tsx                   minimal, unbranded, no creator session
│   ├── v/[token]/page.tsx           viewer shell: resolves share, gates access
│   ├── v/[token]/raw/route.ts       artifact bytes + measurement shim + artifact CSP
│   └── preview/[token]/route.ts     creator preview via signed token (no session)
│
├── api/
│   ├── auth/[...all]/route.ts       BetterAuth handler (app origin)
│   ├── creator/…                    authed: upload, shares, preview, notifications, admin
│   └── public/…                     unauth: resolve, unlock, beacon, abuse-report
│
├── healthz/route.ts                 liveness probe
└── readyz/route.ts                  readiness probe (DB + migrations + storage)
```

See the [API reference](./09-api-reference.md) for every endpoint's contract.

## Request flows

### Creator uploads and shares an artifact

1. Creator signs in (`/api/auth/*`, BetterAuth) → host-only session cookie on the app origin.
2. Creator uploads HTML → `POST /api/creator/upload` → `lib/scan` **scan-and-reject** gate →
   stored via the blob storage interface (`lib/storage`) → `artifact` row written.
3. Creator creates a share → `POST /api/creator/shares` → high-entropy token minted
   (`lib/share-token.ts`) → `share` row written; the returned URL points at the **viewer origin**.

### Viewer opens a shared artifact

1. Viewer opens `https://view.example.com/v/<token>` → `(viewer)/v/[token]/page.tsx`.
2. `resolveShare(token)` (`lib/share.ts`) checks existence, revoke, expiry, and (if set) password.
   Password-gated shares render `viewer-password-form.tsx` → `POST /api/public/unlock` sets an
   httpOnly, host-only, signed access cookie scoped to that share.
3. The shell mounts `viewer-frame.tsx`, an `<iframe src="/v/<token>/raw" sandbox="allow-scripts">`
   (opaque origin, no `allow-same-origin`).
4. `/v/[token]/raw` re-authorizes, fetches the bytes, **injects the measurement shim**
   (`lib/viewer-shim`), and returns them under the strict **artifact CSP** (`connect-src 'none'`,
   `form-action 'none'`).
5. The shim posts engagement messages to the parent shell via `postMessage`; the shell validates
   them and batches them to `POST /api/public/beacon`, which writes `event` rows keyed to the
   **share**.

See [Security](./05-security.md) and [Analytics](./06-analytics.md) for the details of steps 3–5.

## Server lifecycle

`instrumentation.ts` runs at server startup: it applies pending Drizzle migrations, wires graceful
shutdown (flush the analytics write-behind buffer, close the DB), and leaves an OpenTelemetry seam.
The readiness probe (`/readyz`) reports healthy only once the DB, migrations, and storage are ready.

## Deployment shape

One Docker image, one persistent volume (the SQLite file + the blob directory). SQLite runs in WAL
mode and assumes **one writable container** — the app tier does not horizontally scale while SQLite
owns the file. Backups stream the SQLite file to object storage via Litestream (disaster recovery
only — explicitly *not* "S3 as app storage"). See [Configuration & deployment](./10-configuration.md).
