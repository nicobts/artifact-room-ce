# Operations Runbook

Operating a self-hosted Artifact Room instance. The whole state is **one volume**
(`/app/data`): the SQLite DB + the blob directory. Treat it accordingly.

## Release gate — first public release

**These are decisions, not engineering work.** Nothing below is blocked on code;
each item needs a named person to decide it, and none of them can be closed by
the test suite going green. They are unchecked on purpose.

| | Gate | Owner |
|---|---|---|
| ☐ | **CLA reviewed by an IP attorney.** `CLA.md` carries a maintainer note saying so. This is the load-bearing one: the open-core model relies on every contribution being relicensable, and that rests on an agreement no lawyer has read. Remove the note once reviewed. | Owner → IP attorney |
| ☐ | **Privacy policy reviewed.** `components/legal/privacy-content.tsx` carries the same marker. Confirm it discloses everything actually collected: the cookieless first-party `clientId`, the coarse `serverSignalHash` (a hash of User-Agent and headers, never a raw IP), the per-share event record, and its retention. | Owner → attorney |
| ☐ | **Terms reviewed.** `components/legal/terms-content.tsx`, same marker. | Owner → attorney |
| ☐ | **Licence confirmed.** AGPL-3.0 for this edition, and it is consistent across `LICENSE`, `README.md`, `CONTRIBUTING.md`, and `CLA.md`. | Owner |
| ☐ | **First-run verified from a clean clone.** Someone who has never built this follows only the published instructions and reaches a working app on both origins. See `docs/11-development.md`. | Owner or a first reviewer |

Publishing before the first three are closed means shipping a dual-licensing
agreement and user-facing legal copy that no lawyer has read. That is a business
risk to accept deliberately, not an oversight to discover later.

## Deploy

Full deployment guide (published image, production compose, reverse proxy,
upgrades): [`devops/DEPLOYMENT.md`](./devops/DEPLOYMENT.md). Local build:

```bash
cp .env.example .env     # set BETTER_AUTH_SECRET (openssl rand -base64 32),
                         # APP_ORIGIN, VIEWER_ORIGIN
docker compose up --build -d
```

- `APP_ORIGIN` and `VIEWER_ORIGIN` must be **distinct hosts** in production
  (e.g. `app.example.com` / `view.example.com`), both pointing at the container.
- Health: `GET /healthz` (liveness), `GET /readyz` (readiness: DB reachable +
  migrations at head + storage writable). Both are app-origin only.

## Upgrade

```bash
docker compose pull && docker compose up -d
npm run db:migrate        # or run on boot; idempotent, applies pending migrations
```

`/readyz` returns 503 until migrations are at head, so a rolling deploy won't
route traffic to a half-migrated container.

## Backups

**Never copy a live WAL database file directly** — it can capture a torn state.

- **Continuous (recommended): Litestream.** Configure `litestream.yml` + the
  `LITESTREAM_*` env, and run the app under Litestream:
  `litestream replicate -exec "node server.js"`. This streams the SQLite DB to
  S3-compatible storage continuously (DR infra, not the app data layer — ADR 8).
- **On-demand consistent snapshot:**
  ```bash
  sqlite3 /app/data/artifact-room.sqlite "VACUUM INTO '/tmp/backup.sqlite'"
  ```
- **Blobs:** sync `/app/data/blobs` to object storage (immutable content), or
  snapshot the whole volume. Restore SQLite + blobs to the **same** point.

## Restore drill (do this before you need it)

```bash
# 1. Stop the app.  2. On a fresh volume, restore the DB BEFORE starting:
litestream restore -o /app/data/artifact-room.sqlite "${LITESTREAM_REPLICA_URL}"
# 3. Restore the blobs dir.  4. Start the app; confirm GET /readyz -> 200
#    and that artifacts render.
```

## Secret rotation

- `BETTER_AUTH_SECRET`: rotating invalidates existing creator sessions (they
  re-login). Set a new value and restart.
- `VIEWER_ACCESS_SECRET` (falls back to `BETTER_AUTH_SECRET`): rotating forces
  password-gated viewers to re-enter the password.
- Storage / Litestream credentials: update env and restart.

## Logs

Structured JSON via pino; level via `LOG_LEVEL` (`debug`/`info`/`warn`/`error`).
Tokens, passwords, raw IPs, cookies, authorization, and email are **redacted**.
Ship stdout to your aggregator. OpenTelemetry is an opt-in seam
(`OTEL_EXPORTER_OTLP_ENDPOINT`); nothing is emitted externally when unset.

## Incident: abusive artifact

Revoke the share (dashboard) or soft-delete the artifact for an immediate
takedown (pulls all links). Report intake + signature-list management land in
the `abuse-takedown` change.
