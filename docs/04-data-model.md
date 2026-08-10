# 04 — Data model

The schema is the spine and it goes first. Analytics hang off the **`share`**, never the
`artifact` — this is non-retrofittable cheaply and is enforced by construction. Schema lives in
`db/schema.ts` (application tables) and `db/auth-schema.ts` (BetterAuth tables). SQLite is
configured in `db/sqlite.ts` (WAL, `foreign_keys = ON`, `busy_timeout = 5000`,
`synchronous = NORMAL`).

## Entity relationship (application spine)

```
   creator (BetterAuth user)
        │ owns (ownerId, not an FK — identity systems stay separable)
        ▼
   artifact ──1:N──► share ──1:N──► viewer_session ──1:N──► event
   (the file)        (the room,     (cookieless,           (view / slide_view /
                     the token,     per-browser stitch;    dwell / reopen /
                     the key)       forwarding detector)   forward_suspected)
                        │
                        └──1:N──► comment  (scaffolded; flow post-MVP)
```

Every `event.shareId` is mandatory and points at `share`. There is **no `event → artifact`
path** in the schema, by design — that separation is what preserves "Jane vs. Bob" attribution.

## Application tables (`db/schema.ts`)

### `artifact`
The uploaded HTML file and its metadata.

| Column | Type | Notes |
|---|---|---|
| `id` | text (uuid) PK | |
| `ownerId` | text | → BetterAuth `user.id` (referenced, **not** an FK — keeps the two identity systems decoupled) |
| `title` | text | |
| `storageKey` | text | Key into the blob storage interface (`art_<uuid>`) |
| `contentType` | text | `text/html` in MVP (assets inlined) |
| `slideCount` | integer, nullable | Parsed at upload for per-slide analytics |
| `sizeBytes` | integer, nullable | Blob byte length at upload |
| `scanAdvisories` | json (text array), nullable | Non-blocking advisories, e.g. `uses-storage-apis`, `external-subresources`, `safe-browsing-skipped` |
| `version` | integer, default 1 | Bumped on in-place re-upload |
| `createdAt` / `updatedAt` / `deletedAt` | timestamp_ms | `deletedAt` = soft delete |

### `share` — the centerpiece
One artifact → many shares. Each share is a policy wrapper around one token mechanic.

| Column | Type | Notes |
|---|---|---|
| `id` | text (uuid) PK | |
| `artifactId` | text FK → `artifact.id` | |
| `token` | text, **unique index** | High-entropy (256-bit) opaque random token — **this is viewer identity**. Not a JWT. |
| `mode` | text enum | `public` \| `recipient` \| `email_gated` (email_gated **scaffolded**, flow post-MVP) |
| `recipientLabel` | text, nullable | e.g. "Jane @ Acme" |
| `recipientEmail` | text, nullable | Captured/verified in email-gated mode only |
| `passwordHash` | text, nullable | scrypt KDF (`lib/password.ts`) |
| `expiresAt` | timestamp_ms, nullable | Optional expiry |
| `revokedAt` | timestamp_ms, nullable | Immediate revoke |
| `createdAt` | timestamp_ms | |

Usability is computed by `isShareUsable()` in `lib/share-token.ts` (not revoked **and** not expired).

### `viewer_session` — cookieless per-browser stitch
Anonymous; stitches a viewer's events together and powers forwarding detection.

| Column | Type | Notes |
|---|---|---|
| `id` | text (uuid) PK | |
| `shareId` | text FK → `share.id` | |
| `clientId` | text | First-party random id stored on the **viewer origin** (primary viewer identity; cookieless) |
| `serverSignalHash` | text, nullable | Coarse corroboration = `sha256(UA + "\n" + accept-language)` truncated. **Never raw IP.** |
| `firstSeenAt` / `lastSeenAt` | timestamp_ms | |

Viewer identity = storage id + server corroboration.

### `event` — the analytics spine
Every view/dwell. **Keyed to `share`, never `artifact`.**

| Column | Type | Notes |
|---|---|---|
| `id` | text (uuid) PK | |
| `shareId` | text FK → `share.id` | **Mandatory.** No path to `artifact`. |
| `viewerSessionId` | text FK → `viewer_session.id`, nullable | |
| `type` | text enum | `view` \| `slide_view` \| `dwell` \| `reopen` \| `forward_suspected` |
| `slideIndex` | integer, nullable | |
| `durationMs` | integer, nullable | For `dwell` |
| `metadata` | json (text), nullable | Interaction detail |
| `createdAt` | timestamp_ms | |

### `comment` — scaffolded (post-MVP)
Present in schema now so no migration is needed later; the flow is built post-MVP and is
identified-only (attributed to a recipient share, never anonymous public shares).

| Column | Type |
|---|---|
| `id` PK · `shareId` FK · `viewerSessionId` FK (nullable) · `authorLabel` · `slideIndex` (nullable) · `body` · `createdAt` | — |

### Operational tables

| Table | Purpose |
|---|---|
| `rate_limit` | In-process fixed-window state: `key` PK, `count`, `windowStart`. Backs `lib/rate-limit.ts`. |
| `abuse_report` | Public abuse intake: token/artifact reference, reason, `status` (`pending`\|`actioned`\|`dismissed`). |
| `abuse_signature` | Managed known-bad substring list for the scanner: `pattern`, `enabled`, `note`, `createdBy`. Effective at next scan, no redeploy. |
| `creator_prefs` | Per-creator prefs: `notificationsSeenAt` watermark, `emailOnOpen` flag. `userId` PK → BetterAuth user (not an FK). |

## BetterAuth tables (`db/auth-schema.ts`)

Standard BetterAuth set: `user`, `session`, `account`, `verification`. Notable:
`session.ipAddress` is **always null** (IP tracking disabled in `lib/auth.ts`), and `account`
holds the hashed password for email+password auth.

## Invariants (rejected in review if violated)

1. **`event.shareId` is mandatory and points at `share`.** Keying an event to `artifact`
   permanently destroys per-recipient attribution and is rejected on sight.
2. **No raw IP in long-term storage.** IP is read transiently for rate-limiting only; viewer
   corroboration uses a hashed UA + accept-language signal.
3. **`email_gated` mode and the `comment` table are scaffolded now**, so their post-MVP flows
   need no migration.
4. **Portability:** no SQLite-only SQL leaks into app logic; dialect-specific bits stay isolated
   so the SQLite → Postgres move stays cheap behind Drizzle.
5. **Two identity systems stay decoupled:** `artifact.ownerId` and `creator_prefs.userId`
   reference the BetterAuth user by id but are deliberately **not** foreign keys, and nothing joins
   a `viewer_session` to a `user`.
