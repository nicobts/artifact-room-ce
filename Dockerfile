# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Artifact Room — single small image, single persistent volume.
# Multi-stage: deps → build → runtime. Runtime ships only Next's `standalone`
# traced server + the native better-sqlite3 module + committed migrations.
#
# Base image is parameterized so CI (Renovate, per ci-and-supply-chain) can pin
# it by DIGEST for reproducible, provenance-friendly builds, e.g.:
#   --build-arg BASE_IMAGE=node:24-bookworm-slim@sha256:<digest>
# ---------------------------------------------------------------------------
ARG BASE_IMAGE=node:24-bookworm-slim

# ── deps: install ALL deps (dev included) for the build, with a warm npm cache ─
FROM ${BASE_IMAGE} AS deps
WORKDIR /app
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
# Only the manifest + lockfile, so this layer caches until dependencies change.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ── build: compile the Next standalone output ──────────────────────────────
FROM ${BASE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runtime: minimal, non-root, healthchecked ──────────────────────────────
FROM ${BASE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    DATABASE_PATH=/app/data/artifact-room.sqlite

# Non-root runtime user (least privilege).
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin app

# The runtime never runs npm/npx (CMD is `node server.js`; migrations run in
# instrumentation.ts). Strip the npm CLI and corepack that ship with the Node
# base image — they carry their own vendored dependency tree (tar, sigstore,
# brace-expansion, …) that regularly trips CVE scanners and is pure attack
# surface in a serving container.
RUN rm -rf /usr/local/lib/node_modules \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Standalone output: minimal traced server + node_modules (incl. better-sqlite3).
# `--chown` sets ownership at copy time (no extra `chown -R` layer).
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Drizzle migrations are DATA files (SQL + meta/_journal.json) read at boot by
# instrumentation.ts → they are not bundled by webpack and must be copied in.
COPY --from=build --chown=app:app /app/db/migrations ./db/migrations

# Single persistent volume holds the SQLite DB + blob dir.
RUN install -d -o app -g app /app/data
USER app
VOLUME ["/app/data"]
EXPOSE 3000

# Liveness via the app's own healthz endpoint (no extra tooling in the image).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# OCI provenance labels (supply-chain credibility — ci-and-supply-chain).
LABEL org.opencontainers.image.title="Artifact Room" \
      org.opencontainers.image.description="Self-hostable, provider-agnostic host for AI-generated HTML artifacts with per-recipient tracking." \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.source="https://github.com/nicobts/artifact-room-ce"

# `node server.js` stays PID 1 so SIGTERM reaches the app's graceful-shutdown
# handler (flush events, close SQLite). Run with `--init` (compose: init: true)
# for zombie reaping. Migrations run first, inside instrumentation.ts.
CMD ["node", "server.js"]
