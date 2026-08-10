# PRD — Artifact Share (working title)

> An open-source, self-hostable, provider-agnostic host for AI-generated HTML artifacts, with DocSend-grade per-recipient tracking and access control. No viewer login required.

**Status:** MVP scope, ready to build
**Owner:** you
**Last updated:** 2026-06-22

---

## 1. Problem & positioning

### 1.1 The problem
Teams now generate interactive HTML artifacts (slide decks, prototypes, dashboards, calculators) across many different tools — Cursor, Claude, Kimi, DeepSeek, OpenAI, etc. When they want to share one of these artifacts with an **external** person (a partner, prospect, or client), every option is bad:

- **Provider sharing is locked-in and branded.** Claude/OpenAI publish links carry their branding and pull viewers into their funnel; Team/Enterprise artifacts often can't be made public at all.
- **Generic static hosts** (Netlify Drop, Cloudflare Pages, GitHub Pages) host the HTML but offer no access control without a paid tier and no engagement analytics.
- **Nothing tells the sender what happened after the send** — did the prospect open it, which slide did they dwell on, did they forward it.

### 1.2 What we are building (and what we are NOT)
We are **not** building "a place to host HTML." Hosting is the commodity floor. We are building the **share-and-watch loop**: send an interactive artifact to a specific human outside your org, control who can open it, and learn what they did with it.

The mental model: each share is a **room**. You put an artifact in it, you control the key (public / password / per-recipient), and you watch what happens inside.

### 1.3 Positioning
**"DocSend for the AI-artifact era — open source, self-hostable, provider-agnostic."**
DocSend watches dead PDFs; we watch live interactive HTML. Cookieless and self-hostable by default — privacy is a selling point, not a constraint.

### 1.4 Defensibility
- **Wedge (gets users):** agnostic, no-account ingestion of HTML from any tool, unbranded links. Easy to clone, but it's *why people show up*.
- **Bridge (gets contacts):** access control as a first-class primitive — public / password / per-recipient links.
- **Moat (gets revenue):** per-recipient identified engagement intelligence — which slide, how long, return visits, forwarding detection. Hard to build well, compounds over time, is what people pay for.

The platform vendors structurally **cannot** follow us into neutrality (it's against their funnel interest) — that is the seam we occupy.

---

## 2. The architectural spine: two identity systems, never conflated

This is the single most important design rule in the product.

| | **Creators** (upload & manage artifacts) | **Viewers** (open a shared artifact) |
|---|---|---|
| Identity | BetterAuth session (real account) | Unguessable **share token** in the URL — **no account, no login** |
| Optional add-on | — | Email capture/verify (email-gated mode only) |
| Purpose | Manage artifacts, shares, view analytics | Be identified-without-login so analytics & comments attribute correctly |

**Rule:** a viewer NEVER gets an account. Viewer identity = share token (+ optional captured email). Creator identity = BetterAuth. These two systems must not touch.

### 2.1 The share token is the centerpiece
Everything — analytics, access control, comments — hangs off the **share**, not the artifact. The three "modes" are just policy flags on one underlying high-entropy-token mechanic (an opaque random token stored and looked up by unique index — not a signed/JWT token):

- **`public`** — anonymous, count-only. The no-friction wedge ("share with anyone").
- **`recipient`** *(default for a known person)* — tokenized, identified-without-login, full per-slide analytics + attributed comments. **The core.**
- **`email_gated`** *(scaffold in schema for MVP, build flow post-MVP)* — same token, additionally requires email before render. For high-value sends where the sender accepts friction for verified identity.

One artifact → many shares. Build `public` + `recipient` in MVP; scaffold the `email_gated` flag so it drops in later with no migration.

### 2.2 Link forwarding = feature, not bug
A recipient may forward their link. We do **not** prevent this. We **detect** it (same share token, new viewer-session fingerprint / device / concurrent session) and **report** it: "your deck was forwarded inside Acme" is a buying signal. This is differentiating intel.

---

## 3. Tech stack (MVP)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (latest, App Router)** | Marketing + authed dashboard + API routes in one process |
| UI | **shadcn/ui + Tailwind CSS** | Own the components; no dependency churn |
| Creator auth | **BetterAuth** | Creators only — never viewers |
| ORM | **Drizzle** | Schema portable SQLite → Postgres later |
| DB | **SQLite** | Single container + persistent volume. *One writable container* — fine for MVP/long after |
| Blob storage | **Local disk behind a thin interface** (`put(blob)` / `get(id)`) | Swap to S3-compatible later = one-file change |
| Analytics | **Homegrown** — single `event` table + tiny client beacon | NOT Plausible/Matomo — see §3.1 |
| i18n | **next-intl, scaffolded, single locale** | Structure now, translations only when users ask |
| Deploy | **Single container, single volume** | Genuinely tiny; every piece has a clean upgrade path |

**Explicitly rejected for MVP:**
- **Supabase** — contradicts "tiny single container" (it's a service fleet) and "own your data / no lock-in" (hosted dependency). Migration path is SQLite→Postgres + disk→S3, both cheap behind Drizzle/storage-interface. Adopt only if/when scale demands.
- **Plausible / Matomo** — our analytics are the moat, not generic traffic counts. We need *identified, per-recipient, per-slide* events tied to share tokens — a domain model no general web-analytics tool expresses. We'd own the data anyway to tie it to recipients, so a second system is pure overhead. Homegrown is *less* code than integrating Matomo.
- **IP as identity** — IP = a network, not a person (NAT, CGNAT, VPN, mobile). Also PII under GDPR, undermining the cookieless selling point. Use IP only as a supplementary anti-abuse / dedup signal, never as the identity layer.

### 3.1 Why homegrown analytics
Plausible/Matomo answer "how many people hit this URL." We must answer "**did jane@acme.com reach the pricing slide, how long did she dwell, did she return Tuesday, did she forward it.**" That's identified per-recipient per-slice engagement keyed to our share tokens. Single `event` table + small beacon + our own queries. Cookieless, self-hosted by default.

---

## 4. Data model

> Analytics hang off the **share**, not the artifact. This is non-retrofittable cheaply — get it right at line one.

```
artifact
  id              (pk)
  ownerId         -> creator (BetterAuth user)
  title
  storageKey      (blob interface key for the HTML bundle)
  contentType     (single-file HTML; assets inlined for MVP)
  slideCount      (nullable; parsed/declared for per-slide analytics)
  createdAt, updatedAt, deletedAt

share                          # THE CENTERPIECE ROW
  id              (pk)
  artifactId      -> artifact
  token           (unguessable, indexed; this IS viewer identity)
  mode            enum: public | recipient | email_gated
  recipientLabel  (nullable; e.g. "Jane @ Acme")
  recipientEmail  (nullable; captured/verified in email_gated)
  passwordHash    (nullable; for password-protected shares)
  expiresAt       (nullable)
  revokedAt       (nullable)
  createdAt

viewer_session                 # anonymous, per-browser; stitches events + detects forwarding
  id              (pk)
  shareId         -> share
  fingerprint     (device/browser signal; NOT raw IP stored long-term)
  firstSeenAt, lastSeenAt

event                          # every view/dwell/comment-event
  id              (pk)
  shareId         -> share     # <-- keyed to SHARE, never artifact
  viewerSessionId -> viewer_session
  type            enum: view | slide_view | dwell | reopen | forward_suspected
  slideIndex      (nullable)
  durationMs      (nullable; for dwell)
  metadata        (json; per-event detail, e.g. section detection)
  createdAt

comment                        # post-MVP build, schema scaffolded now
  id              (pk)
  shareId         -> share
  viewerSessionId -> viewer_session
  authorLabel     (from share.recipientLabel/email — identified, not anonymous)
  slideIndex      (nullable; anchor to a slide/region)
  body
  createdAt
```

**Schema rules:**
- `event.shareId` is mandatory and points to `share`. Keying to `artifact` instead permanently destroys "Jane vs Bob" separation.
- `email_gated` mode + `comment` table are **scaffolded now, flows built post-MVP** — present in schema so no migration later.
- Raw IP is never stored long-term; derive a fingerprint, keep IP transiently for rate-limiting only.

---

## 5. MVP scope

### 5.1 In scope (build now)
1. **Creator auth** (BetterAuth): sign up / sign in, single-team.
2. **Artifact upload**: paste or drop a complete HTML file (assets inlined). Stored via blob interface on local disk. Provider-agnostic, **no branding injected**.
3. **Artifact rendering**: serve at a clean unbranded URL, sandboxed (see §6).
4. **Shares**:
   - Create `public` link (count-only).
   - Create `recipient` link (tokenized, labeled, identified).
   - Optional password on any share.
   - Optional expiry; revoke.
   - `email_gated` flag exists in schema (flow not built).
5. **Analytics (the differentiator)**:
   - View / unique-viewer counts per share.
   - **Per-slide dwell time** (the DocSend-grade intel).
   - Reopen / return-visit detection.
   - **Forwarding detection** (same token, new viewer-session).
   - Creator dashboard: per-artifact and per-share breakdown.
6. **Storage interface** abstraction (disk now, S3 later).
7. **i18n scaffold** (next-intl, one locale).
8. **Abuse baseline** (see §6 — this is day-one, not v2).

### 5.2 Out of scope (post-MVP, but schema-ready)
- Email-gated magic-link viewing flow.
- Comment threads (identified, per-recipient, slide-anchored) — see §7.
- Slack/email sender notifications ("Jane just opened it").
- Team roles / audit logs / custom domains (managed-tier features).
- Postgres + S3 migration; managed cloud offering.
- Translations beyond the scaffold.

### 5.3 Explicit non-goals
- Viewer accounts of any kind.
- Being a general static host / Netlify competitor.
- **Free anonymous hosting** (no account, no card) — the phishing/malware abuse magnet.

---

## 6. Abuse & security (DAY ONE — not a later feature)

Anonymous, no-login upload of arbitrary HTML is a phishing/malware magnet. **One Google Safe Browsing flag kills every link on the domain.** This is the actual hard engineering — treat as launch-blocking.

- **Sandboxed rendering:** serve viewer HTML from an isolated origin, in a sandboxed `<iframe>`, under a **strict Content-Security-Policy**. Block credential-harvesting patterns (no forms posting to external origins).
- **Upload scanning:** scan uploaded HTML for known phishing/malware signatures before a link goes live.
- **Rate limits:** on upload and on share creation (IP used here transiently — legitimate use).
- **Takedown pipeline:** ability to instantly revoke a share/artifact; abuse-report endpoint.
- **Token security:** share tokens unguessable (high-entropy), constant-time compare, optional expiry/revoke.
- **Password shares:** hash with a strong KDF; never store plaintext.
- **Privacy by default:** cookieless analytics; no raw IP retention; EU-friendly. This is a *selling point* — lean in.

---

## 7. Commenting (post-MVP, scaffolded)

Strengthens the moat — but **only the identified version.**

- **On `recipient` / `email_gated` shares → comments ON**, attributed to the recipient, slide-anchored, notify sender. Valuable team/paid feature. ("Acme's CTO asked about SSO" is actionable intel.)
- **On `public` shares → comments OFF by default** (or at most an emoji-reaction primitive). An open anonymous text box = a second abuse pipeline on top of HTML moderation, and anonymous comments are near-worthless anyway.
- Comments hang off the **share token identity** (the same identified-without-login mechanic), never off open public links.

---

## 8. Validation gate (do this BEFORE heavy build)

You have the perfect petri dish: your own multi-tool team. For two weeks, whenever anyone shares an artifact externally, record:
1. Did they want it **public or locked**?
2. Did they ask **"did they open it / what did they look at?"**

- If Q2 recurs → **build the company** (analytics moat is real).
- If only Q1 → it's an **OSS visibility project** (still worth it; know which you're in).

Build order: MVP core (upload → link → access control → basic + per-slide analytics) → confirm which feature people beg for → then comments / email-gate / managed cloud.

---

## 9. Business model (context, not MVP work)

- **OSS core (AGPL-3.0):** agnostic upload, public + password + per-recipient links, per-slide analytics, self-host — the *full* product, a **real** product, not crippleware. This is the adoption engine (stars → self-host → word-of-mouth). Future managed/enterprise modules (`/ee`) are separately licensed (Functional Source License — non-compete, converts to Apache-2.0 after 2 years).
- **Hosted tier — planned, not built:** when it exists it will add team-oriented convenience (managed hosting, enterprise/compliance controls, support) sold per-team/per-seat, B2B. Nothing here is paywalled today; the self-hostable core stays fully functional without it.
- **Willingness-to-pay** lives in managed convenience (few want to personally own the untrusted-HTML security surface), enterprise/compliance, and support — never in "host my HTML," which is free everywhere via self-host.
- Paid comparators: **DocSend / PandaDoc / Pitch / Papermark**, not Netlify.

---

## 10. Open questions / decisions deferred
- Slide-boundary detection: parse known deck formats vs. require a declared `slideCount` / data-attributes convention? (MVP: declared convention, parse later.)
- Fingerprinting method for viewer-session that's robust but privacy-respecting (no raw IP retention).
- When to introduce Postgres + S3 (trigger: multi-container scale or storage volume).
- Managed-cloud build trigger (trigger: validation gate Q2 confirmed + inbound demand).
