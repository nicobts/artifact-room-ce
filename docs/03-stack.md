# 03 — Stack

The stack is fixed and non-negotiable for MVP. This
page records what is **actually installed** (versions from `package.json`) and why each piece is here.

## Runtime & framework

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Framework | **Next.js** (App Router) | `16.2.9` | Marketing + authed console + API in one process. Uses the Next 16 **proxy** convention (`proxy.ts`), not legacy middleware. |
| Language | **TypeScript** | `^5` | `tsc --noEmit` is a CI gate. |
| UI runtime | **React** / React DOM | `19.2.4` | Server Components by default; client only where interactivity demands it. |
| Node | pinned via `.nvmrc` | — | Single supported Node line for reproducible builds. |

## UI & styling

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Component system | **shadcn/ui** (CLI) | `shadcn ^4.11.0` | Components are **copied in and owned** under `components/ui`, not black-boxed. Style preset `radix-nova` (see `components.json`). |
| Primitives | **radix-ui** | `^1.6.0` | Accessible primitives underneath shadcn. |
| CSS | **Tailwind CSS v4** | `^4` (`@tailwindcss/postcss ^4`) | CSS-variable theming via `@theme inline` in `app/globals.css`. |
| Animation utils | **tw-animate-css** | `^1.4.0` | Utility keyframes. |
| Icons | **lucide-react** | `^1.21.0` | Icon set. |
| Charts | **recharts** | `^3.8.0` | Analytics visualizations (e.g. the 14-day views area chart). |
| Toasts | **sonner** | `^2.0.7` | Notification toasts. |
| Theming | **next-themes** | `^0.4.6` | Light/dark, wired through CSS variables. |
| Class utils | **clsx**, **tailwind-merge**, **class-variance-authority** | — | shadcn's standard styling helpers. |
| Drawer / table | **vaul**, **@tanstack/react-table**, **@dnd-kit/**\* | — | Installed; `@tanstack/react-table` and `@dnd-kit` are present but not yet wired (the shares table is a hand-rolled implementation). See [Components](./08-components.md). |

## Data, auth & validation

| Concern | Choice | Version | Notes |
|---|---|---|---|
| ORM | **Drizzle ORM** | `^0.45.2` | Schema/queries kept **portable to Postgres**; migrations via `drizzle-kit ^0.31.10`. |
| Database | **SQLite** (`better-sqlite3`) | `^12.11.1` | Single writable container + persistent volume. WAL mode, foreign keys ON. |
| Creator auth | **BetterAuth** | `^1.6.20` | Creators **only** — never viewers. IP tracking disabled; host-only cookies. |
| Validation | **zod** | `^4.4.3` | Request/body validation. |

## Analytics & ops

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Analytics | **Homegrown** | — | Single `event` table + cookieless client beacon + injected measurement shim. **Not** Plausible/Matomo — the analytics are the moat. See [Analytics](./06-analytics.md). |
| Logging | **pino** | `^10.3.1` | Structured logs with redaction of tokens/passwords/email/IP (`lib/log.ts`). |
| Blob storage | **Local disk behind an interface** | — | `lib/storage` — `put`/`get`/`delete`; disk impl writes a `.meta` sidecar. Swappable to S3-compatible later. |
| Backups | **Litestream** | (ops) | Streams the SQLite file to object storage for point-in-time recovery — disaster recovery only. |

## Testing

| Layer | Tool | Version | Command |
|---|---|---|---|
| Unit | **Vitest** | `^4.1.9` | `npm run test:unit` (`tests/unit`) |
| Integration | Vitest + in-memory `better-sqlite3` | — | `npm run test:integration` (`tests/integration`) |
| End-to-end | **Playwright** | `@playwright/test ^1.61.0` | `npm run test:e2e` |

See [Development & testing](./11-development.md) for the testing standard.

## Build & deploy

- One small **Docker** image + one persistent **volume** (SQLite file + blob dir). See `Dockerfile`,
  `docker-compose.yml`, `.dockerignore`.
- **CI/CD:** lint + typecheck + unit + integration + e2e gate every change; CodeQL scanning;
  releases publish a non-root, digest-pinned container to GHCR with an SBOM and build provenance
  (see `.github/`).

## Explicitly forbidden in MVP

These are forbidden for MVP; introducing any requires an explicit ADR, not a drive-by:

- **Supabase, Postgres, S3 as app storage** — deferred behind the Drizzle + storage-interface seams.
- **Plausible / Matomo / any third-party analytics** — the analytics are homegrown and are the moat.
- **Viewer accounts of any kind.**
- **Anonymous (unauthenticated) artifact upload** — upload requires an authenticated creator.
- **Provider branding injected into rendered artifacts** — neutrality is the wedge.
- Features that pull toward a "general static host" or a consumer-volume model.

> Note: streaming the SQLite file to S3-compatible storage **for backups** (Litestream) is
> explicitly *not* the forbidden "S3 as app storage" — it is disaster-recovery infrastructure.
