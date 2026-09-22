# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-09-22

### Added

- **Four share protection levels.** One token mechanic, one creator-facing
  choice: `public` (nothing to supply), `email` (the registered address),
  `email_password` (address **and** password), and `password` (a per-recipient
  link). The stored `mode`, `password_hash`, and `recipient_email` are derived
  from the level, so invalid combinations cannot be created. Expiry applies at
  any level and revoke is immediate at all of them. Pre-existing shares in the
  two shapes the older API allowed keep working and are shown honestly as
  `link-only (legacy)` and `password, no recipient (legacy)` rather than being
  rewritten into a policy the creator never chose.
- **A keyboard-accessible upload path.** The uploader and the in-place replace
  flow were drag-and-drop only, with no file input anywhere in the application.
  A `.zip` bundle has no paste equivalent, so keyboard and screen-reader users
  could not upload one at all. Both surfaces now carry a labelled
  "Choose a file" control.

### Changed

- **Unlock failures are indistinguishable.** Wrong address, wrong password,
  unknown token, revoked, expired, and rate-limited all return one identical
  response. Anything finer let a caller enumerate which tokens exist and which
  addresses are registered against them.
- **Per-section analytics are labelled experimental** in the README, the
  analytics documentation, and on the recipient drill-down itself. Region
  detection is heuristic, and an artifact without section or slide markup falls
  back to inferring structure from scroll depth rather than reading it, so
  coverage is an estimate. The view, dwell, reopen and forwarding signals
  underneath are unaffected.
- **Toolchain pinned to Node 24.** `engines` plus `engine-strict` now refuse an
  install on a toolchain that would rewrite `package-lock.json` into a layout CI
  cannot consume. npm 10 and npm 11+ produce mutually incompatible layouts for
  this tree; the failure it caused in CI named the platform package, never the
  npm version.
- `TRUSTED_PROXY_HOPS` is documented in `devops/DEPLOYMENT.md` — what it means,
  the correct value per topology, and what degrades when it is wrong.

### Removed

- **The `interaction` event type.** Nothing emitted it; it was scaffolding for
  click tracking that was never built. Accepting it meant a client could write
  rows no part of the product produced or read. Type-level only in Drizzle's
  SQLite dialect, so no migration and no data change. The viewer-facing privacy
  copy, which told viewers the product recorded "interactions", was corrected to
  match what is actually collected.

### Fixed

- **A first run no longer fails on things CI never showed.** Integration tests
  timed out on a cold machine because password hashing is deliberately
  expensive and the default 5s allowance did not cover it under parallel load;
  the e2e suite ran against the real development database, accumulating test
  artifacts in a console a developer was also using and starving its own upload
  rate limit; and the upload specs raced React hydration. The e2e suite now owns
  `data/e2e.sqlite`, migrated before the server starts.
- Two high-severity advisories cleared (`js-yaml`, `nanoid`). The shadcn CLI was
  a runtime dependency despite nothing importing it, which put its whole
  dependency tree into the production install; it is now a dev dependency.
- A relative link in `devops/DEPLOYMENT.md` escaped the repository root, and a
  stray tag terminated thirteen documentation files.

## [0.2.1] — 2026-07-26

### Security

- **Next.js 16.3.5 and sharp 0.35.4.** `next@16.2.12` fell inside the ranges
  of two critical advisories (GHSA-p293-qw3h-jr36, unauthenticated RCE on
  Windows-hosted servers; GHSA-2xp9-vwfh-vxw4, RCE in the Image Optimization
  API with AVIF), and `sharp@0.35.3` carried the libheif advisory
  GHSA-rgj7-g3m4-5g8c. Both ship in the image. `eslint-config-next` moves
  with `next`; no application code changed.
- **Runtime image no longer ships the npm CLI**: the Node base image's bundled
  npm vendors its own dependency tree (`tar`, `sigstore`, `brace-expansion`,
  `picomatch`) that carried 1 CRITICAL + 5 HIGH advisories in the `0.2.0`
  image. The serving container only runs `node server.js`, so npm, npx,
  corepack, and yarn are stripped from the runtime stage. The application's
  own dependencies were and remain clean.

### Fixed

- Release/scheduled image scans re-pinned to a resolvable `trivy-action`
  commit; scheduled scans now print findings in the job log and fail on
  CRITICAL/HIGH (visible without Advanced Security while the repo is private).

## [0.2.0] — 2026-07-26

### Added

- **Zip bundle upload** (`zip-bundle-upload`): creators can upload a `.zip`
  containing exactly one root HTML file plus an optional `assets/` folder — the
  shape many AI tools export. Bundles are validated fail-closed (magic-byte
  detection, strict layout contract, asset-extension allowlist,
  decompression-bomb and hostile-entry-name guards) and normalized **at ingest**
  into a single self-contained HTML document (scripts/styles inlined, binaries
  as `data:` URIs), so the single-file serving/CSP/sandbox pipeline is
  unchanged and the scanner always sees the exact bytes that will be served.
  Works on both initial upload and in-place replacement; successful bundles
  carry a `bundle-inlined` advisory.

### Security

- **Rate-limit identity hardening**: client-controlled `X-Forwarded-For` is no
  longer trusted for rate-limit identity (spoofing bypass).
- **Sandbox escape hardening** on the viewer render path.
- **Upload DoS guard**: oversized request bodies are rejected before buffering.
- **Secure sign-up default**: `SIGNUP_MODE` defaults to invite-only.
- **Dependency advisories cleared**: better-auth updated past an
  account-takeover advisory (GHSA-qq9h-g4jm-xgf3); Next.js 16.2.12; `postcss`
  and `sharp` overridden to patched versions across the tree. The CI advisory
  gate now hard-blocks on production (shipped) dependencies and reports
  dev-toolchain advisories non-blockingly.

### Fixed

- **Pinned next-intl to 4.13.0**: 4.13.1–4.13.4 auto-inject locale-detection
  middleware that displaces the app proxy, breaking routing and bypassing the
  two-origin viewer isolation. Do not bump without green auth + viewer e2e.
- CI reliability: lockfile regenerated for npm 10 with all-platform native
  bindings; CodeQL granted `actions: read` and skipped on private forks.

## [0.1.0] — 2026-07-09

The complete MVP — the share-and-watch loop, end to end. Ten changes,
implemented with unit + integration + e2e coverage. First published image:
`ghcr.io/nicobts/artifact-room:0.1.0` (linux/amd64 + linux/arm64).

### Added

- **Single-container skeleton** (`setup-project`): Next.js 16 (App Router, TS
  strict) + React 19 + Tailwind v4 + shadcn; Drizzle + better-sqlite3 with
  `foreign_keys=ON`/WAL pragmas; two-origin spine (app vs. viewer) via the proxy;
  local-disk `StorageAdapter`; next-intl scaffold; standalone non-root Dockerfile
  + compose; Vitest + Playwright harnesses. Fonts: Inter + JetBrains Mono.
- **Data-model spine** (`core-schema`): `artifact / share / viewer_session /
  event` (+ scaffolded `comment` and `email_gated`). Events key to `share`,
  never `artifact`. Opaque high-entropy share tokens (`lib/share-token`).
- **Creator auth** (`creator-auth`): BetterAuth email+password, server session
  guard, host-only cookies, IP tracking disabled, `SIGNUP_MODE` invite gate.
- **Artifact upload** (`artifact-upload`): authenticated ingest with a
  scan-and-reject pipeline (shape → heuristics → Safe Browsing), unmodified-byte
  storage, slide-count parsing, per-creator/IP rate limiting, soft-delete.
- **Shares** (`shares-public-and-recipient`): `public`/`recipient` shares; typed
  `resolveShare` (fail-closed, no leak on bad token); scrypt password gate;
  expiry; immediate revoke.
- **Sandboxed rendering** (`viewer-render-sandbox`): artifacts served from a
  separate viewer origin inside a sandboxed (opaque-origin) iframe under a strict
  CSP (`connect-src 'none'`, `form-action 'none'`); operator CDN allowlist;
  unbranded measurement shim with layered slide detection.
- **Engagement analytics** (`analytics-engagement`): cookieless beacon (client
  batching + server write-behind buffer); per-slide dwell; reopen + forwarding
  detection; identified per-recipient dashboard (public = count-only).
- **Operations** (`ops-hardening`): `/healthz` + `/readyz`, graceful-flush
  shutdown, redacting structured logs, Litestream backup config + runbook.
- **CI/supply chain** (`ci-and-supply-chain`): PR pipeline (typecheck/lint/unit/
  integration/e2e), CodeQL, npm-audit gate, Renovate, GHCR release with SBOM +
  SLSA provenance.
- **Abuse handling** (`abuse-takedown`): public report intake, instant admin
  takedown (revoke/soft-delete), managed signature list consulted by the scanner.

### Security

- Untrusted HTML is always served from a separate origin, sandboxed, under a
  strict CSP — defense in depth independent of upload scanning.
- No raw IP at rest; cookieless viewer analytics; host-only creator cookies;
  fail-closed access control; logs redact secrets and PII.
