# devops/

Everything about **building, shipping, and running** Artifact Room that isn't
required to live at the repo root. Toolchain-mandated files stay at the root
(`Dockerfile`, `.dockerignore`, `docker-compose.yml` for local dev,
`litestream.yml`, `.github/workflows/`); this folder holds the deployment
artifacts and the documentation that ties the pipeline together.

## The pipeline at a glance

```
 PR / push to main                        git tag v1.2.3
 ─────────────────                        ──────────────
 ci.yml                                   release.yml
 ├─ checks   typecheck · lint · unit ·    ├─ image    multi-arch build (amd64+arm64)
 │           integration                  │           → push ghcr.io/nicobts/artifact-room-ce
 ├─ e2e      Playwright across BOTH       │           → SBOM + SLSA provenance + attestation
 │           origins (security walls)     ├─ scan     Trivy on the pushed digest → Security tab
 ├─ image    docker build + boot +        └─ release  GitHub Release, auto notes
 │           /healthz + /readyz smoke
 └─ audit    npm advisories               weekly: image-scan.yml re-scans :latest for new CVEs
                                          always:  codeql.yml (static analysis), Renovate (deps)
```

One principle end to end: **the artifact users deploy is the artifact CI
tested** — the same Dockerfile is built and booted on every PR, and the tag
build only adds architectures and signatures.

## What's here

| Path | What it is |
|---|---|
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | **Start here to self-host** — quickstart, production compose, upgrade, backup, troubleshooting |
| [`RELEASING.md`](./RELEASING.md) | Maintainer release process + how anyone verifies a published image |
| [`compose/docker-compose.prod.yml`](./compose/docker-compose.prod.yml) | Production compose: pulls the GHCR image, one volume, optional Litestream backup sidecar (`--profile backup`) |
| [`proxy/Caddyfile`](./proxy/Caddyfile) | Recommended reverse proxy — two origins, automatic TLS |
| [`proxy/nginx.conf`](./proxy/nginx.conf) | nginx alternative |

## Design constraints (why it looks this way)

- **One image, one volume.** SQLite + local blobs under `/app/data`; no
  database server, no object store required. Backup = one volume
  (+ optional Litestream streaming).
- **Two hostnames are non-negotiable.** `APP_ORIGIN` / `VIEWER_ORIGIN` must be
  distinct hosts — untrusted HTML renders on its own origin. The proxy configs
  exist mostly to make this easy.
- **Small, non-root, verifiable image.** Next standalone output on
  `node:24-bookworm-slim`, uid 10001, healthcheck built in; SBOM, provenance,
  and attestation published with every release.
- **GHCR because the repo is public** — image and source live together,
  `GITHUB_TOKEN` auth, no extra registry account for contributors.

Operations (backup drills, secret rotation, incidents) live in the
[runbook](../RUNBOOK.md).
