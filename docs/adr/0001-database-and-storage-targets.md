# ADR 0001 — Database & blob storage targets: SQLite for self-host, managed libSQL (Turso) for managed SaaS

- **Status:** Proposed (2026-07-03) — owner ratifies
- **Deciders:** owner
- **Supersedes/updates:** the project's deferral of Postgres/object-storage
  (`docs/03-stack.md` → "Explicitly forbidden in MVP"). On acceptance, record the ratified target
  in the **Decision** section below (managed libSQL + object storage as the managed-tier DB/blob
  targets) and update `docs/03-stack.md`.
- **Related:** [`docs/02-architecture.md`](../02-architecture.md), [`docs/04-data-model.md`](../04-data-model.md).

## Recommendation (lead)

**For the managed SaaS database, adopt Turso (managed libSQL), with Cloud SQL for PostgreSQL kept as
the documented alternative.** Self-host stays **SQLite + local disk** unchanged; blobs externalize to
**object storage (R2/GCS/S3)** on the managed tier regardless of DB choice. Turso is recommended
because it keeps a **single SQLite/libSQL dialect across self-host and managed** — eliminating the
two-dialect maintenance/CI burden the Postgres choice imposes — and its cheap **database-per-tenant**
model delivers hard per-customer data isolation (the B2B/Enterprise fence) at negligible marginal
cost. This ADR stays **Proposed** pending owner ratification.

## Context

The MVP runs on **SQLite (single writable container) + local-disk blob storage + Litestream** for
DR, behind two seams mandated from day one: **Drizzle (portable schema)** and a
**`put/get/delete` storage interface**. Postgres and object storage were explicitly deferred, *to be
adopted only via an ADR*.

The managed SaaS wants managed operations, HA, and headroom past the single-writer/single-host
ceiling. The app tier must remain a **long-lived container** (Fly or Cloud Run) on every path — **not
Vercel or per-request serverless** — for two app-specific reasons documented in `deployment.md` §4.7:
(1) hosting untrusted user HTML on a shared serverless platform is an abuse blast-radius risk (a
suspension takes down both origins at once), and (2) the in-memory analytics **write-behind buffer**
needs a long-lived process. So the open question is the **database**, not the app host.

Three managed database options were evaluated (`deployment.md` §4):

1. **Fly.io + SQLite/LiteFS** — cheapest launch, **no DB rewrite**, single dialect (SQLite). But it is
   not a *managed* DB; it stays on the single-writer/single-host model (LiteFS adds replicas/failover).
   Kept as the Phase-0 launch substrate and the interim, not the managed-tier target.
2. **Turso (managed libSQL)** — a managed, SQLite-compatible database. **Single dialect end-to-end**
   with self-host, so there is no second SQL dialect to port and CI-test forever. First-class
   **database-per-tenant** (unlimited DBs, billed by monthly-active databases since "Database Freedom
   Day", mid-2025), giving physical per-customer isolation without a container/volume fleet. Embedded
   replicas give microsecond local reads; **writes route to a cloud primary** (write latency is not
   replica-accelerated — acceptable for this low-write app). Runs behind a container host.
3. **Cloud Run + Cloud SQL (Postgres) + GCS** — genuine managed autoscaling on mature Postgres, but it
   is the **only** option that introduces a **second SQL dialect** to maintain and CI-test forever, at
   a higher infra floor (~$80–100/mo @ 10 customers; crossover ≈ 100 customers) because of the
   always-on Cloud SQL instance.

**Cost & rewrite facts that shaped the call** (estimates — `deployment.md` §7, retrieved 2026-07-03):
Turso's floor is **~$15–25/mo at 10 customers** (container host + Turso Developer $4.99 + object
storage), roughly **4–5× cheaper than the Postgres path** at that scale. A **sync→async rewrite is
paid on either managed path** — today's synchronous `better-sqlite3` becomes async `@libsql/client`
(Turso) or `pg` (Postgres) — so it is **not** a differentiator; Drizzle ports the schema either way.
What differs is the **dialect count (one vs two)** and the **isolation model** (built-in DB-per-tenant
vs. schema/row scoping).

## Decision

Adopt a permanent **dual-target** data layer, selected by deployment configuration behind the
existing interfaces. The managed tier's **recommended** target is **Turso (managed libSQL)**;
**Cloud SQL Postgres** is retained as the **documented alternative** for teams that specifically want
GCP-managed Postgres and accept the dual-dialect tax.

| | Self-host (default) | Managed SaaS — **recommended** | Managed SaaS — alternative |
|---|---|---|---|
| Database | **SQLite** (better-sqlite3) | **Turso (managed libSQL)** via `@libsql/client` | PostgreSQL on Cloud SQL via `pg` |
| Dialect | SQLite | **SQLite/libSQL (same as self-host)** | Postgres (**second dialect**) |
| Tenant isolation | Single DB (logical) | **Database-per-tenant** (physical, cheap) | Schema/row scoping (logical) |
| Blob storage | **Local disk** | **Object storage** (R2/GCS/S3) | Google Cloud Storage |
| Backups/DR | **Litestream** → object storage | Turso PITR (1→30→90-day by tier) + per-DB export | Cloud SQL automated backups + PITR |
| App runtime | One Docker container + one volume | **Long-lived container** (Fly or Cloud Run) | **Cloud Run** (autoscaling) |
| Origins | Two hostnames, one process | Two hostnames via Host routing (`proxy.ts`) on the container host | Two hostnames via Host routing behind an HTTPS LB |

Self-host and the managed tier are both first-class and **CI-tested**. On the recommended (Turso)
path, CI runs a **single SQLite/libSQL dialect**; if the owner elects the Postgres alternative, CI
must run **both** SQLite and Postgres so portability cannot silently rot. **Vercel/per-request
serverless is not a supported app host** on any path (`deployment.md` §4.7).

## What this entails (implemented later, as separate changes)

**Recommended path — Turso (managed libSQL):**

1. **libSQL client + async migration** — swap synchronous `better-sqlite3` for the async
   `@libsql/client` behind Drizzle (**first-class `drizzle-orm` libSQL support**). This is a
   **sync→async** change across the data-access layer — the one real cost, and it is paid on the
   Postgres alternative too. Turso has **no built-in migration system**; keep Drizzle migrations, run
   `instrumentation.ts` migration-on-boot per tenant DB (on provision / first-touch).
2. **Object-storage adapter** (`R2`/`GCS`/`S3`) for the storage interface — the disk adapter stays for
   self-host. One-file change behind `put/get/delete`.
3. **Config selector** — choose driver + storage backend via env (e.g. `DATABASE_URL` /
   `TURSO_*` / `STORAGE_BACKEND`). Same dialect as self-host means the SQLite path is the default.
4. **Database-per-tenant provisioning** — a small control-plane seam to create/rotate/delete a libSQL
   DB per creator/team via the Turso platform API, map tenant → DB, and run migrations on new DBs.
   This is the isolation payoff; scope it as its own change.
5. **Multi-instance correctness (autoscaling container host):**
   - **Rate limiting** — the `rate_limit` table is a plain SQL table in the (per-tenant or shared)
     libSQL DB, so it works across instances **unchanged**. ✅ (Deliberately table-backed, not
     in-process — this is the payoff, and it ports as-is because the dialect is unchanged.)
   - **Analytics write-behind buffer** — currently in-memory. Harden the graceful-shutdown flush for
     `SIGTERM` (finite grace window on Fly/Cloud Run), or move to write-through, to avoid event loss
     on scale-down. **Launch-blocking for the managed path.**
   - **Embedded-replica staleness** — if embedded/edge replicas are used, bound and reason about read
     staleness (writes go to the primary); default to primary reads where correctness needs it.
   - **BetterAuth sessions** — DB-backed → fine multi-instance. Cookies stay host-only per origin.
6. **Two origins on the container host** — one service with Host-based routing (`proxy.ts` already
   routes by Host); Fly certs, or a Cloud Run HTTPS LB with two mapped domains + managed certs,
   preserving viewer-origin isolation (and the per-artifact-subdomain upgrade path).
7. **CI** — the recommended path runs a **single SQLite/libSQL dialect**, so integration tests need
   only the SQLite/libSQL target (no dual-dialect matrix). This is the CI saving vs. Postgres.
8. **Backups** — SaaS uses **Turso PITR** (1-day Free → 30-day Scaler → 90-day Pro) + per-DB export;
   self-host keeps Litestream. Blobs get object-store versioning.

**Alternative path — Cloud SQL Postgres (only if elected instead of Turso):** additionally requires a
**Drizzle Postgres dialect** (`pg` driver + Postgres migrations; audit timestamp-ms/JSON/boolean/
`on conflict`/unique-index bits), **serverless connection management** (Cloud SQL Node connector /
PgBouncer-style pooler with a bounded per-instance pool), and a **dual-dialect CI matrix** (SQLite +
Postgres) so portability cannot silently rot. Same buffer-SIGTERM and object-storage work as above.

## Consequences

**Positive**
- **One dialect end-to-end (recommended path).** Managed and self-host both speak SQLite/libSQL — no
  second dialect to port, audit, or CI-test forever. This is the primary reason for the recommendation.
- **Cheap, physical per-tenant isolation** via database-per-tenant — the strongest answer for
  per-recipient-analytics privacy, GDPR export/erasure, and residency, **without** an N-container/
  N-volume control plane. A natural B2B/Enterprise fence at negligible marginal cost.
- **Lowest managed floor** (~$15–25/mo @ 10 customers) — no always-on Cloud SQL instance.
- Keeps the one-container self-host story intact and cloud-agnostic; managed HA/backups/PITR are
  Turso's responsibility.

**Negative / costs**
- **Sync→async rewrite** of the data layer (`better-sqlite3` → `@libsql/client`). Unavoidable on the
  Postgres alternative too, so not a differentiator — but real work.
- **Vendor dependency for the managed tier (Turso Cloud).** Mitigated *more* than Postgres/GCP, not
  less: the dialect is identical to self-host, libSQL is open-source and self-hostable (libSQL server /
  `sqld`), so the exit hatch is a config change back to SQLite/LiteFS or a VM — no schema rewrite.
- **libSQL maturity & write latency.** libSQL (Rust rewrite) and its tooling are younger than
  Postgres; writes route to the cloud primary (not replica-accelerated) and embedded-replica reads can
  be stale — acceptable for this low-write app, but weigh honestly.
- **Alternative-path costs (if Postgres is elected):** two dialects + two storage adapters to maintain
  and CI-test; higher infra floor (~$80–100/mo @ 10 customers; crossover ≈ 100 customers); Cloud SQL +
  serverless connection management; GCP coupling for the managed tier.

**Trade vs the deployment doc's Phase-0 (Fly.io + SQLite):** Fly/SQLite remains the **cheapest launch
with zero DB rewrite** and is the recommended interim. This ADR is about the **managed** target once
you commit to a managed DB — and on that axis Turso keeps you on one dialect while adding managed ops
and DB-per-tenant isolation.

## Alternatives considered

- **Cloud SQL Postgres + GCS** (previously this ADR's decision) — genuine managed autoscaling and
  mature Postgres ops, but the **only** option that forces a **second SQL dialect** to maintain and
  CI-test forever, at a higher infra floor. **Retained as the documented alternative**, not the
  recommendation, for teams that specifically want GCP-managed Postgres.
- **Fly.io + SQLite/LiteFS** (deployment.md Phase-0 primary) — cheapest, single-dialect, **no rewrite**;
  but not a *managed* DB (stays single-writer/single-host). Kept as the launch substrate and interim,
  not the managed-tier target.
- **Container-per-customer SQLite sharding** — single dialect and hard isolation, but ops-heavy (N
  containers/volumes + control plane). Turso's database-per-tenant achieves the *data* isolation
  without the fleet; reserve container-per-customer for dedicated-*compute* cases.
- **SQLite on Cloud Run** — rejected: stateless mismatch, no horizontal scale, dominated on cost.
- **Vercel / per-request serverless as app host** — rejected on any path: untrusted-HTML abuse
  blast-radius (a suspension takes down both origins) and the write-behind buffer needs a long-lived
  process (`deployment.md` §4.7).

## Sequencing (gated)

This ADR records the **recommended decision** (Turso) and stays **Proposed** pending owner
ratification. **Implementation is gated on the managed-tier greenlight**, which itself follows the
OSS-launch validation. Self-host ships on SQLite now regardless.
Until greenlit, keep schema/queries strictly portable (already required) so this stays cheap — note
that staying on the SQLite/libSQL dialect keeps portability trivially satisfied on the recommended
path. When greenlit, implement as separate changes — e.g. `db-libsql-turso`, `db-per-tenant-provisioning`,
`storage-object-adapter`, `saas-buffer-durability`, `container-host-deploy` — each meeting the
Definition of Done, and record the ratified target in the **Decision** section above and in
`docs/03-stack.md`. (If the owner elects the
Postgres alternative instead, substitute `db-postgres-dialect` + dual-dialect CI + `cloudsql-deploy`.)
