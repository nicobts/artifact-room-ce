# 08 — Component inventory

The UI has **three surfaces with deliberately different bars**:

- **Creator console** (authed, rich) — full shadcn block-based UI; the place to invest design
  effort, because it is where the analytics moat is *seen*.
- **Viewer shell** (public, token-gated) — minimal, fast, unbranded, sandboxed. Deliberately
  under-designed: the artifact is the content; the shell is a thin, secure host. No shadcn weight,
  no branding.
- **Marketing / landing** — the OSS funnel and first impression.

Components live in `components/` (bespoke) and `components/ui/` (owned shadcn primitives). Config is
`components.json` (style preset `radix-nova`, Tailwind v4, CSS variables, Lucide icons).

## shadcn/ui primitives — `components/ui/`

Owned, copied-in primitives (accessible by default): `avatar`, `badge`, `breadcrumb`, `button`,
`card`, `chart` (recharts wrapper: `ChartContainer` / `ChartTooltip` / `ChartLegend`), `checkbox`,
`drawer`, `dropdown-menu`, `field`, `input`, `label`, `select`, `separator`, `sheet`, `sidebar`,
`skeleton`, `sonner`, `table`, `tabs`, `toggle`, `toggle-group`, `tooltip`.

## Creator console — bespoke components

### Artifact management
| Component | Purpose |
|---|---|
| `artifact-uploader.tsx` | Drag-drop / paste HTML upload with title input → `POST /api/creator/upload` |
| `artifact-preview.tsx` | Sandboxed iframe preview via `POST /api/creator/preview` (signed token) with refresh |
| `artifact-replace.tsx` | In-place re-upload (versioning) with drag-drop + rescan |
| `delete-artifact-button.tsx` | Soft-delete an artifact |

### Share management
| Component | Purpose |
|---|---|
| `create-share-form.tsx` | Mode selector (public/recipient), recipient label, optional password, expiry → `POST /api/creator/shares` |
| `share-row-actions.tsx` | Copy-link + revoke actions per share |
| `shares-table.tsx` | Filterable/sortable table of all shares (by artifact, by mode) with inline row expansion for per-slide dwell |

### Analytics & engagement
| Component | Purpose |
|---|---|
| `overview-cards.tsx` | Five-card grid: Artifacts, Shares, Views, Unique viewers, Forwarded |
| `views-chart.tsx` | recharts `AreaChart` — 14-day views time series |
| `recent-activity.tsx` | Activity feed (first-open, reopen, forward signals) |
| `top-artifacts.tsx` | Artifacts ranked by engagement |
| `forwarding-alerts.tsx` | Alert card for shares with detected forwarding |
| `slide-funnel.tsx` | Per-slide reach funnel + dwell bars (recipient drill-down) |
| `session-timeline.tsx` | Per-viewer-session timeline (clientId, first/last seen, events, reopens) |

### Navigation & layout
| Component | Purpose |
|---|---|
| `app-sidebar.tsx` | Collapsible sidebar: Dashboard / Artifacts / Analytics / Admin + user section |
| `site-header.tsx` | Header with sidebar trigger, page title, notifications bell |
| `nav-user.tsx` | User avatar dropdown (name/email, sign-out) |
| `notifications-bell.tsx` | Notifications dropdown feed with unread badge and polling → `/api/creator/notifications` |

### Admin (admin-only)
| Component | Purpose |
|---|---|
| `admin-signatures.tsx` | Add/remove known-bad scanner signature patterns |
| `admin-takedown-button.tsx` | Revoke all shares for a reported token / take an artifact down |

### Auth
| Component | Purpose |
|---|---|
| `login-form.tsx` | Email/password sign-in via `authClient.signIn.email()` |
| `signup-form.tsx` | Name / email / password / confirm via `authClient.signUp.email()` |

## Console pages (where components compose)

| Route | Composes |
|---|---|
| `/dashboard` | `overview-cards`, `recent-activity`, `top-artifacts` |
| `/artifacts` | `artifact-uploader`, artifact grid, `delete-artifact-button` |
| `/artifacts/[id]` | `artifact-preview`, metadata card, analytics recap, recent events, `create-share-form`, share cards + `share-row-actions`, `artifact-replace` |
| `/artifacts/[id]/shares/[shareId]` | engagement stats, `slide-funnel`, `session-timeline`, forwarding alerts |
| `/analytics` | `views-chart`, `forwarding-alerts`, `shares-table` |
| `/admin` | reports list, `admin-takedown-button`, `admin-signatures` |

## Viewer shell — deliberately minimal

Only two components, and intentionally lightweight:

| Component | Purpose |
|---|---|
| `viewer-frame.tsx` | Mounts `<iframe src="/v/<token>/raw" sandbox="allow-scripts">` (opaque origin), validates shim `postMessage`s, batches events to `/api/public/beacon`, shows a CSP-violation warning bar |
| `viewer-password-form.tsx` | Minimal plain-HTML password gate (no shadcn) → `POST /api/public/unlock` |

The `(viewer)` layout is an unstyled wrapper. No shadcn weight, no marketing components, no provider
branding on this path — by mandate.

## Theming & visual identity

- **Tailwind v4** with CSS-variable theming in `app/globals.css` (`@theme inline`); **next-themes**
  for light/dark.
- **Fonts:** Inter (`--font-sans`), JetBrains Mono (`--font-mono`).
- **Palette (Ivory / Navy / Ember)** — warm-ivory background, navy primary/sidebar, ember-orange
  accent for brand/active/focus, yellow-orange for forwarding warnings. Base radius `0.625rem`.
  Owned by the `console-visual-identity` change.

## Notes on installed-but-not-yet-wired libraries

`@tanstack/react-table` and `@dnd-kit/*` are dependencies but are **not yet used** — the shares
table is a hand-rolled implementation, and no drag-drop surface exists yet. They are staged for
future use (e.g. reorderable lists, richer data tables). Flagged here so the dependency list and the
actual UI don't read as out of sync.
