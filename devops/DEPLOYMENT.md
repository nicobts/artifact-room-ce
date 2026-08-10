# Deploying Artifact Room

Artifact Room ships as **one small Docker image with one persistent volume**.
The image is published to the GitHub Container Registry on every release:

```
ghcr.io/nicobts/artifact-room-ce
```

Multi-arch (`linux/amd64`, `linux/arm64` — Raspberry Pi / Graviton / Apple
Silicon hosts work), non-root, with an SBOM and SLSA build provenance attached
(see [RELEASING.md](./RELEASING.md#verifying-a-release) for how to verify).

| Tag | Meaning |
|---|---|
| `1.2.3` | Exact release — **pin this in production** |
| `1.2` | Latest patch of a minor — safe-ish auto-update lane |
| `latest` | Latest stable release — evaluation only |
| `sha-<commit>` | Immutable build of a specific commit |

## Requirements

- Docker Engine 24+ (or any OCI runtime) on a Linux host — 1 vCPU / 512 MB is
  plenty to start; SQLite means no database server to run.
- **Two DNS hostnames pointing at the same host**, e.g. `app.example.com`
  (creator dashboard) and `view.example.com` (sandboxed artifact rendering).
  This is a security boundary, not a convenience: untrusted HTML renders on a
  separate origin so it can never touch creator sessions. One hostname is not
  a supported production setup.
- A reverse proxy for TLS ([proxy/Caddyfile](./proxy/Caddyfile) or
  [proxy/nginx.conf](./proxy/nginx.conf)).

## Try it in one command

```bash
docker run -d --name artifact-room --init -p 3000:3000 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e APP_ORIGIN=http://localhost:3000 \
  -e VIEWER_ORIGIN=http://view.localhost:3000 \
  -v artifact-data:/app/data \
  ghcr.io/nicobts/artifact-room-ce:latest
```

Open http://localhost:3000. Migrations run automatically on boot; all state
lands in the `artifact-data` volume. (`*.localhost` resolves to 127.0.0.1 in
every modern browser — no hosts-file edits needed.)

## Production (Docker Compose)

1. Get the deploy files (clone the repo, or copy
   [`compose/docker-compose.prod.yml`](./compose/docker-compose.prod.yml),
   the root `.env.example`, and — if you want continuous backups — the root
   `litestream.yml`).

2. Configure:

   ```bash
   cp .env.example .env
   ```

   Set at minimum:

   | Variable | Value |
   |---|---|
   | `APP_ORIGIN` | `https://app.example.com` |
   | `VIEWER_ORIGIN` | `https://view.example.com` — **must differ from `APP_ORIGIN`** |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `ARTIFACT_ROOM_VERSION` | a pinned version, e.g. `1.2.3` |

   Recommended for a public instance: `SIGNUP_MODE=invite` +
   `SIGNUP_ALLOWLIST` (who may register) and `ADMIN_EMAILS` (promote-only
   admin bootstrap applied at boot — day-to-day role management is in /admin).
   Every variable is documented inline in `.env.example`.

3. Start:

   ```bash
   docker compose --env-file .env -f devops/compose/docker-compose.prod.yml up -d
   ```

4. Put the reverse proxy in front (both hostnames → `127.0.0.1:3000`; the app
   routes on the Host header). With Caddy that's the whole
   [Caddyfile](./proxy/Caddyfile) — TLS included.

5. Verify: `curl -fsS https://app.example.com/readyz` → `200` (DB reachable,
   migrations at head, storage writable). `/healthz` is the cheap liveness
   probe; both live on the app origin only.

## `TRUSTED_PROXY_HOPS` — set this to match your topology

Every rate limit on a public endpoint is keyed by client IP, and the client IP
is read from `X-Forwarded-For`. The leftmost entries of that header are
supplied by the caller and can say anything; only the entries your own trusted
proxies appended are believable. So the app counts **from the right**:
`TRUSTED_PROXY_HOPS` is how many hops at the end of the chain you control.

| Your topology | Value |
|---|---|
| One reverse proxy in front of the container (the documented Compose setup) | `1` (default) |
| Cloudflare → your nginx/Caddy → app | `2` |
| Any additional trusted proxy in the chain | add 1 per hop |

Count only proxies **you** control and that append to `X-Forwarded-For`. A load
balancer that rewrites the header rather than appending is one hop, not two.

**Set it too high** and you read an entry the client supplied. A caller can
then rotate a fake IP per request and every IP-keyed rate limit stops working —
upload, share resolution, unlock, and abuse reporting all become unbounded.
That is the dangerous direction.

**Set it too low** and you key limits on your own proxy's address, so all
traffic shares one bucket and legitimate users throttle each other.

**A proxy-less deployment is not a supported production topology.** With
nothing appending `X-Forwarded-For`, there is no trustworthy client IP at all:
`lib/client-ip.ts` falls back to `local`, every request shares a single
rate-limit key, and IP-keyed limits are advisory rather than enforcing. Run the
reverse proxy from step 4 — it is also what terminates TLS.

The value is never persisted. It exists only to derive a transient rate-limit
key; no raw IP is written to the database (see [`docs/05-security.md`](../docs/05-security.md)).

## Upgrading

```bash
# Pinned version (recommended): bump ARTIFACT_ROOM_VERSION in .env, then
docker compose --env-file .env -f devops/compose/docker-compose.prod.yml pull
docker compose --env-file .env -f devops/compose/docker-compose.prod.yml up -d
```

Migrations apply on boot, forward-only; `/readyz` returns 503 until they're at
head, so a load balancer won't route to a half-migrated container. **Take a
backup before upgrading** (below) — that's also your downgrade path: restore
the volume, run the previous tag.

Check the [release notes](https://github.com/nicobts/artifact-room-ce/releases)
for breaking changes before any major-version bump.

## Backups

Everything lives in `/app/data` (SQLite DB + blobs). Never file-copy a live
WAL database. Two supported paths:

- **Continuous (recommended):** enable the Litestream sidecar —
  set `LITESTREAM_REPLICA_URL` / `LITESTREAM_ACCESS_KEY_ID` /
  `LITESTREAM_SECRET_ACCESS_KEY` in `.env`, then add `--profile backup` to the
  compose commands above. It streams the DB to any S3-compatible bucket.
- **On-demand snapshot:**
  `docker compose exec app node -e "..."` — or simplest, from the host:
  `docker run --rm -v artifact-data:/data alpine tar czf - /data > backup.tgz`
  while the app is stopped, or use `sqlite3 ... "VACUUM INTO ..."` on a live DB.

Restore drill, rotation, and incident response live in the
[operations runbook](../RUNBOOK.md).

## Troubleshooting

- **Container restarts / `unhealthy`** — `docker logs artifact-room`; the most
  common cause is a missing `BETTER_AUTH_SECRET`.
- **`/readyz` stays 503** — the data volume isn't writable by the container
  user (uid `10001`), or migrations failed; the logs say which.
- **Login works but artifacts don't render** — `VIEWER_ORIGIN` isn't resolving
  to the container, or it equals `APP_ORIGIN`. They must be two distinct
  hostnames, both proxied to the same port.
- **Redirect loops behind the proxy** — the proxy must forward the original
  `Host` and set `X-Forwarded-Proto` (both example configs do).

## Building the image yourself

```bash
docker build -t artifact-room:local .
```

The AGPL asks that users of a modified instance can obtain your modified
source — publishing your fork and building from it satisfies that.
