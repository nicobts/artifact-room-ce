# 06 — Analytics: the moat

> **Per-section analytics are experimental.** Region detection is heuristic. An
> artifact that carries explicit section or slide markup is measured; one that
> does not falls back to inferring structure from scroll depth, which estimates
> rather than reads it. Coverage and the per-slide funnel are therefore
> indicative, not exact — worth acting on as a signal, not as a count. The
> view, dwell, reopen and forwarding signals underneath them are not affected.

The analytics are the product. The target question is **never** "how many views." It is:

> "Did *this specific recipient* reach *this specific slide*, how long did they dwell, did they
> return, did they forward it?"

Any analytics work that produces only aggregate pageview numbers has missed the point. Value =
**identified, per-recipient, per-slice engagement** tied to share tokens. This is why the analytics
are homegrown (a single `event` table + a tiny cookieless beacon + an injected measurement shim)
rather than Plausible/Matomo — no general web-analytics tool expresses this domain model, and we'd
own the data anyway to tie it to recipients.

## The measurement pipeline end-to-end

```
  artifact HTML                shim (injected)            shell (parent)            server
  ─────────────                ───────────────            ──────────────           ──────
  served at /v/<token>/raw ──► IIFE observes slides  ──► viewer-frame.tsx      ──► POST /api/public/beacon
  with shim prepended          via IntersectionObserver   validates + batches       parseBeacon()
                               postMessage(msg, ORIGIN)    (5s / on unload)          recordBeacon()
                                                                                     └► event rows (keyed to share)
```

### 1. The injected shim — `lib/viewer-shim/shim.ts`

A minified IIFE injected into the artifact HTML by `injectShim(html, VIEWER_ORIGIN)` on the
`/v/[token]/raw` route. It runs **inside** the sandboxed iframe and:

- **Detects regions**, trying a ladder, top priority first:
  1. `[data-ar-section]` (≥1 element) — explicit, creator-declared sections. Highest fidelity: a
     labelled, named breakdown instead of an inferred one.
  2. `[data-slide]` (≥2) → `.reveal .slides > section` (reveal.js) → `body > section` /
     `main > section` (≥2) — declared/framework/structural slide markup.
  3. Scroll quartiles (fallback for a scrollable page taller than 1.5× the viewport) — four
     *synthetic* regions, not DOM elements, labelled exactly `"0–25%"`, `"25–50%"`, `"50–75%"`,
     `"75–100%"` (U+2013 en dash). A `scroll` listener buckets `scrollTop / (scrollHeight -
     innerHeight)` into one of the four quartiles (`Math.floor(p * 4)`, clamped to 3) and emits
     `slide_view` on bucket change, exactly like a real slide change.
  4. Whole document (last resort — a single implicit region) when none of the above apply.
  - **Labelling** (declared/structural/annotated regions only; quartiles use their fixed
    strings above): `data-ar-label` → `data-ar-section`'s own value → the element's `id` →
    its first `h1`/`h2`/`h3` text → `null`. Each candidate is whitespace-collapsed and capped at
    32 characters. The labels array is capped at 40 entries, then trimmed further (popping from
    the end) until the whole `view` message fits the shim's ~2000-byte budget — a payload is
    never dropped over label size; it degrades to fewer (or zero) labels first.
- Emits messages via `parent.postMessage(msg, VIEWER_ORIGIN)` (strict target origin):
  - `view` on load, carrying detection metadata: `{method, kind, count, labels?}` — `method` is
    one of `annotated` / `declared` / `framework` / `structural` / `quartiles` / `document`;
    `kind` is the coarser `sections` / `slides` / `scroll` / `document` used everywhere else
    (queries, UI). The shim reposts the same `view` message (`repost: true`) 2 seconds later, in
    case the first one raced the parent's listener.
  - `slide_view` on region change (IntersectionObserver at thresholds 0.25 / 0.5 / 0.75 for
    element-based regions; the scroll-bucket listener above for quartiles) — `slideIndex` is the
    element's position, or the quartile bucket (0–3).
  - `dwell` on region exit / visibility change (with `durationMs`)
  - `visible` / `hidden` on document visibility changes
  - `blocked` on the first CSP violation (via a `securitypolicyviolation` listener)

The shim never makes network calls itself (the artifact CSP has `connect-src 'none'`); it only
`postMessage`s to the trusted parent, which owns the network.

Detection metadata doesn't ride its own event: the shell (`viewer-frame.tsx`) holds the single,
de-duped pageview unsent for up to 2200ms (past the shim's 2s repost) so the first `view` message
carrying `detection` can attach it to that pageview's `metadata`. If detection arrives after the
pageview already flushed (a slow shim, or a flush forced by `hidden`/a full batch), it attaches
instead to the next persisted `slide_view`/`dwell` event — first detection wins, and the pageview
is never double-counted or held indefinitely waiting for it.

### 2. The parent shell — `components/viewer-frame.tsx`

A client component that mounts the sandboxed iframe and:

- Listens for `message` events and runs every payload through `validateShimMessage()`
  (`lib/viewer-shim/protocol.ts`), which checks source/shape, rejects oversized (>2048 B) or
  version-mismatched messages, and clamps numeric fields (`slideIndex` < 10000,
  `durationMs` < 86_400_000).
- **Batches** valid events and POSTs them to `/api/public/beacon` on a short interval, using
  `navigator.sendBeacon` for a final flush on unload.
- Surfaces a warning bar if a `blocked` (CSP violation) message arrives — the artifact still
  renders, but the viewer is told a resource was blocked for safety.

### 3. The beacon endpoint — `lib/analytics/beacon.ts`

`POST /api/public/beacon` is cookieless: identity is `clientId` (first-party viewer-origin
`localStorage` id) + the share token. IP is read transiently and never persisted.

- `parseBeacon(body)` validates `{ token, clientId, events }`, caps `clientId` at 64 chars,
  slices to ≤100 events, and keeps only persistable types (`view`, `slide_view`, `dwell`).
  Each event's `metadata.detection` is re-validated by `sanitizeDetection()` — a
  strict, independent gate (method as string, count as a finite number, `kind` against the same
  `DETECTION_KINDS` enum, labels re-capped at `MAX_LABELS`/`MAX_LABEL_CHARS`) that never trusts the
  shim's own client-side sanitization, since this is a public endpoint reachable independent of the
  shim/shell path. Only that sanitized shape is ever persisted to `event.metadata`.
- `recordBeacon(input)` resolves `token → shareId` via `getViewableArtifact()` (fail-closed),
  stitches the viewer session, derives `forward_suspected` / `reopen`, and enqueues rows — all
  keyed to `shareId`, **never** `artifact`.
- The endpoint ACKs immediately (`202`/`204`) and writes behind the response.

### 4. Session stitching & forwarding detection — `lib/analytics/session.ts`

- `computeServerSignalHash(ua, acceptLanguage)` = truncated `sha256(ua + "\n" + acceptLanguage)`.
  Coarse corroboration only — **not** stored identity, **not** raw IP.
- `resolveOrCreateViewerSession(db, shareId, clientId, serverSignalHash)`:
  - Existing `(shareId, clientId)` with a last-seen gap > 30 min → `isReopen = true` → a `reopen`
    event.
  - A **new** `clientId` appearing on a share that already has other clientIds →
    `isForward = true` → a `forward_suspected` event.

**Forwarding is a feature, not a bug.** We do not prevent link forwarding; we detect and report it
("your deck was forwarded inside Acme" is a buying signal).

### 5. Write-behind buffer — `lib/analytics/buffer.ts`

`enqueueEvents()` pushes rows to an in-memory buffer (soft cap 500, hard cap 5000; flush every
~1 s or immediately at the soft cap). On overflow it drops oldest `dwell` events first and never
drops `view` / `forward_suspected`. `flushEvents()` does a transactional batch insert; the buffer
is flushed on graceful shutdown (ops-hardening). This keeps the hot beacon path off the write path.

## Aggregation queries — `lib/analytics/queries.ts`

All owner-scoped (a creator only ever sees their own data). Powers the dashboard surfaces:

| Function | Returns | Used by |
|---|---|---|
| `getShareDetection(shareId)` | the max-count detection payload (`{method, kind, count, labels?}`) among the share's recent events, or `null` | `getShareStats`, `getShareCoverage` |
| `getShareCoverage(shareId)` | distinct `slide_view` region indexes ÷ `detection.count`, clamped to ≤1 and rounded to 2dp; `null` when detection is missing or its count is 0 | share rows, drill-down, artifact recap |
| `getShareStats(shareId)` | unique viewers, views, reopens, forwards, per-slide dwell ms, `coverage`, `detection` | share rows, drill-down |
| `getShareTimeline(ownerId, shareId)` | per-slide funnel (reached, total ms), per-session timeline, forward events, `regionKind`, `regionLabels` | recipient drill-down |
| `listSharesWithStats(ownerId, artifactId?)` | every owned share + inline stats (incl. `coverage`) | shares table |
| `getAccountOverview(ownerId)` | totals + recent activity + top artifacts | dashboard |
| `getArtifactStats(ownerId, artifactId)` | aggregate across all shares of an artifact, incl. `avgCoverage` | artifact detail recap |
| `getViewsTimeSeries(ownerId, days=14)` | zero-filled per-UTC-day view counts | views chart |

Coverage is intentionally `null`, never `0`, when a share has no recorded detection yet — the UI
renders it as "—" rather than implying zero engagement. `getShareDetection` scans the share's
recent metadata-bearing events regardless of type — detection can ride any persisted event (see
the "riding the view" note above), never a dedicated event row of its own — and keeps the
detection with the highest region count, so a later low-fidelity detection (small viewport,
replaced artifact) cannot shrink the coverage denominator.

Aggregations are written to stay fast on SQLite and survive the Postgres move.

## What a creator sees

- **Dashboard** — account overview cards, recent activity, top artifacts.
- **Analytics page** — 14-day views area chart, forwarding alerts, a coverage column on the
  filterable shares table (inline per-slide dwell breakdown), and the **"Improve your tracking"**
  guidance card (`components/tracking-guidance.tsx`, `#improve-tracking`): a collapsible
  explainer of the detection ladder with a copyable `data-ar-section`/`data-ar-label` HTML
  snippet and a copyable one-line AI prompt, so a creator can ask their own AI tool to annotate
  their artifact. It expands on click or when the page loads with the `#improve-tracking` hash.
- **Artifact detail** — aggregated recap across an artifact's shares + recent events, with average
  coverage across its shares.
- **Recipient drill-down** (`/artifacts/[id]/shares/[shareId]`) — the moat made visible: a labelled
  per-slide dwell funnel (falling back to `Part N` / `Slide N` when a region has no label), a
  coverage percentage, and a detection badge (e.g. "3 sections (annotated)", "scroll depth
  (auto)", "single page") describing how regions were found for that share. When detection fell
  back to `scroll` or `document`, a "Add sections for richer insight →" link jumps straight to the
  guidance card.

See [Components](./08-components.md) for the UI pieces and [Features](./07-features.md) for status.

## Event types (recap)

`view` · `slide_view` · `dwell` (has `durationMs`) · `reopen` (derived) ·
`forward_suspected` (derived). Click tracking is a possible future type, not a shipped one. All key to `share`. New event types must document their retention +
privacy in their spec (Definition of Done §5).
