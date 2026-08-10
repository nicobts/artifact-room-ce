# 11 — Development & testing

## Prerequisites

- Node on the line pinned in `.nvmrc`.

> **If `npm install` refuses to run**, that is deliberate. `package.json`
> declares `engines` and `.npmrc` sets `engine-strict=true`, so npm stops
> rather than installing on a toolchain that would rewrite the lockfile into a
> layout CI cannot consume. npm 10 and npm 11+ produce mutually incompatible
> layouts for this tree — npm 10 keeps a nested `@esbuild/*` set that npm 11+
> dedupes away — and the resulting CI failure is an opaque
> *"Missing: @esbuild/&lt;platform&gt; from lock file"* that gives no hint the npm
> version caused it. Install the Node version in `.nvmrc` and the error goes
> away.
- The two viewer/app hosts resolvable locally (`app.localhost` / `view.localhost` work out of the
  box on most systems; see `.env.example`).

> **Why `package.json` has an `allowScripts` entry.** `better-sqlite3` is a
> native module: its install script fetches or builds the binding the app and
> every integration test depend on. npm 12 and later block dependency install
> scripts unless they are listed in `allowScripts`, so without that entry
> `npm ci` completes "successfully" but produces no binding — the app will not
> start and every integration test fails with *"Could not locate the bindings
> file."* The entry is deliberately version-less so it does not go stale when
> the dependency is bumped. Older npm (including the version CI resolves from
> `.nvmrc`) ignores the field and runs the script as usual.

## Local development

```bash
npm ci
cp .env.example .env         # set BETTER_AUTH_SECRET, APP_ORIGIN, VIEWER_ORIGIN
npm run db:migrate           # apply Drizzle migrations to the SQLite file
npm run dev                  # serves BOTH origins from one dev server
```

> **Windows note (this repo's environment):** an agent-launched `npm run dev` tends to get reaped;
> run it yourself in the session with `! npm run dev` and verify UI with a one-shot Playwright
> screenshot rather than a long-lived server.

Useful scripts (`package.json`):

| Script | Does |
|---|---|
| `npm run dev` | Next dev server (both origins) |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations (`db/migrate.ts`) |
| `npm run test:unit` | Vitest unit tests (`tests/unit`) |
| `npm run test:integration` | Vitest integration tests (`tests/integration`) |
| `npm run test:e2e` | Playwright e2e (`playwright.config.ts`) |

> **The e2e suite runs against its own database**, `./data/e2e.sqlite`, dropped
> at the start of every run. It never touches the dev database, so test
> artifacts, shares and users cannot pollute a console you are also using by
> hand. It also keeps the suite re-runnable: rate-limit counters live in the
> `rate_limit` table of whichever database is in use, and the `upload:ip:` cap
> is 60/hour against a single shared IP — without a fresh database the suite
> could not run twice in an hour without spurious 429s that surface as
> unrelated assertion failures. Limits therefore stay at production values
> under test. Override the path with `E2E_DATABASE_PATH`.

## Testing standard (proportionate to risk)

Three layers, weighted toward the security- and moat-critical paths:

- **Unit (Vitest):** pure logic — token generation/entropy/uniqueness, constant-time compare,
  `isShareUsable` (revoked/expired), fingerprint derivation, storage-adapter round-trip,
  scan heuristics, aggregation helpers.
- **Integration (Vitest + in-memory `better-sqlite3`):** schema invariants and data access — an
  `event` requires a valid `shareId` and has **no** path to an `artifact`; access-control gating
  (password/expiry/revoke); migrations apply clean on an empty DB.
- **End-to-end (Playwright):** real journeys across both identity systems. Mandatory flows:
  - **Creator:** sign up → upload HTML → create `public` + `recipient` shares → see them in the
    dashboard.
  - **Viewer:** open a `recipient` link by token (no login) → artifact renders sandboxed → a
    `view` + per-slide `dwell` is recorded → it surfaces in the dashboard attributed to that share.
  - **Access control:** password-gated share blocks without the password; expired/revoked share is
    refused.
  - **Forwarding:** multi-context opens the *same* token in a second browser context → assert a new
    `viewer_session` + a `forward_suspected` event.
  - **Security:** assert the iframe carries the expected `sandbox`/CSP attributes and that a form
    posting to an external origin is blocked.

Every change ships its own e2e scenarios. Heaviest coverage on token gen/validation, access-control
gating, event-attribution correctness, and CSP/sandbox enforcement — a bug there is a breach or a
broken moat.

## Definition of Done (per change)

A change is done only when all hold:

1. The design was agreed in an issue before implementation began.
2. Schema changes are Drizzle migrations, Postgres-portable.
3. Identity-system separation respected and stated (which system does it touch?).
4. If it touches untrusted HTML: CSP/sandbox/scanning in the **same** change.
5. If it adds an event type: retention + privacy documented; keyed to `share`.
6. Public endpoints: rate-limited + revocable.
7. Tests proportionate to risk — unit/integration **and** the change's e2e flows — passing.
8. Any UI surface built shadcn-first and to the production-grade bar (a11y AA, responsive, good
   Core Web Vitals).
9. No invariant in [`05-security.md`](./05-security.md) or [`04-data-model.md`](./04-data-model.md) crossed.
10. Docs under `docs/` updated to match what now ships.

## CI/CD

Every change is gated in CI by lint + typecheck + unit + integration + e2e, plus CodeQL scanning.
Releases publish a non-root, digest-pinned container to GHCR with an SBOM and build provenance.
See `.github/`.

## Repo map (top level)

| Path | Contents |
|---|---|
| `app/` | App Router routes (`(auth)`, `(creator)`, `(viewer)`, `api`, legal, health) |
| `components/` | Bespoke components + owned shadcn `ui/` primitives |
| `lib/` | Domain logic: auth, session, share, scan, storage, analytics, csp, rate-limit, abuse, notifications, log, viewer-shim |
| `db/` | Drizzle schema, auth-schema, SQLite setup, client, migrations |
| `hooks/` | Client React hooks |
| `tests/` | `unit/`, `integration/`, e2e specs |
| `proxy.ts` | Two-origin routing (Next 16 proxy convention) |
| `instrumentation.ts` | Startup migrations, graceful shutdown, OTel seam |
| Root docs | `README.md`, `prd.md`, `SECURITY.md`, `CONTRIBUTING.md`, `RUNBOOK.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `CLA.md` |
