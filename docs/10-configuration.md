# 10 — Configuration & deployment

Artifact Room deploys as **one small Docker image + one persistent volume** (the SQLite file + the
blob directory). See `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `litestream.yml`, and
`RUNBOOK.md`. The canonical example config is `.env.example`.

## Environment variables

### Core / auth
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | ✅ | — | BetterAuth signing secret. Also the fallback for viewer/preview HMAC secrets. |
| `BETTER_AUTH_URL` | — | falls back to `APP_ORIGIN` | Base URL for BetterAuth. |
| `APP_ORIGIN` | ✅ | — | The app/console origin. Used for trusted origins and preview `frame-ancestors`. |
| `SIGNUP_MODE` | — | `open` | `open` or `invite`. In `invite`, only allowlisted emails may sign up. |
| `SIGNUP_ALLOWLIST` | — | — | Comma-separated emails permitted in `invite` mode. |

### Viewer origin
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VIEWER_ORIGIN` | ✅ | — | The **separate** viewer origin (dedicated host/subdomain). Untrusted HTML renders only here. |
| `VIEWER_ACCESS_SECRET` | — | falls back to `BETTER_AUTH_SECRET` (dev fallback: an insecure dev string) | HMAC secret for the per-share access cookie. Set a real value in production. |
| `VIEWER_CDN_ALLOWLIST` | — | — | Space-separated origins added to the artifact CSP for passive subresources. Empty = external subresources blocked (the secure default). |

### Storage & database
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_PATH` | — | `./data/artifact-room.sqlite` | SQLite file path. |
| `DATA_DIR` | — | `./data` | Base data dir; blobs live at `${DATA_DIR}/blobs`. |

### Scanning
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SAFE_BROWSING_API_KEY` | — | — | Google Safe Browsing v4 key. **Absent = Safe Browsing is a no-op** (advisory `safe-browsing-skipped`); scanning otherwise proceeds. |

### Logging
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LOG_LEVEL` | — | `info` | pino level. |
| `NODE_ENV` | — | — | Affects trusted-origin handling and dev-only fallbacks. |

### Email (optional, off by default — post-MVP surface)
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SMTP_HOST` | — | — | Presence enables the best-effort email path (`lib/email.ts`). |
| `SMTP_PORT` | — | `587` | `465` implies TLS (`secure: true`). |
| `SMTP_USER` / `SMTP_PASS` | — | — | Optional SMTP auth. |
| `SMTP_FROM` | — | `SMTP_USER` or `artifact-room@localhost` | From address. |

> Email uses a dynamic import of an optional dependency and no-ops gracefully if it isn't installed
> or a creator hasn't opted in — it never blocks the request path.

## Two-origin setup

The app must be reachable on **two distinct hosts** — one for the console/API (`APP_ORIGIN`) and one
for viewing artifacts (`VIEWER_ORIGIN`). Locally, `.env.example` uses `app.localhost:3000` and
`view.localhost:3000`, both served by the one dev/prod server; `proxy.ts` routes by Host header. In
production, point two DNS names (e.g. `app.example.com` and `view.example.com`) at the same
container.

Keeping the viewer on a genuinely separate origin is a **security requirement**, not cosmetic — it
is what makes the sandboxed artifact an opaque cross-origin document. Do not collapse the two hosts.

## Docker

```bash
cp .env.example .env        # set BETTER_AUTH_SECRET, APP_ORIGIN, VIEWER_ORIGIN (+ secrets)
docker compose up           # app on app.localhost:3000, viewer on view.localhost:3000
```

The image runs **non-root**, is **digest-pinned**, and releases ship with an SBOM and build
provenance. One volume holds the SQLite file and the blob dir — back that
volume up (below).

## Server lifecycle

`instrumentation.ts` runs at startup: apply pending Drizzle migrations, register graceful-shutdown
handlers (flush the analytics write-behind buffer, close the DB), and leave an OpenTelemetry seam.
`/readyz` reports healthy only once DB + migrations + storage are ready — wire it to your
orchestrator's readiness probe and `/healthz` to liveness.

## Backups & disaster recovery (Litestream)

`ops-hardening` streams the SQLite file to S3-compatible object storage for point-in-time recovery
(`litestream.yml`). This is **disaster-recovery infrastructure**, explicitly distinct from the
forbidden "S3 as app storage". Never take a raw file copy of a live WAL
database — use the online-backup procedure in `RUNBOOK.md`.

## Upgrade paths (designed-in, not MVP work)

- **SQLite → Postgres:** schema/queries are Postgres-portable behind Drizzle; introducing Postgres
  requires its own ADR/spec.
- **Disk → S3 blobs:** swap the `lib/storage` disk adapter for an S3-compatible one — a one-file
  change behind the `put`/`get`/`delete` interface (also requires an ADR to adopt as app storage).
- **Per-artifact subdomains:** a documented later upgrade beyond the single viewer origin for
  cross-artifact isolation.
