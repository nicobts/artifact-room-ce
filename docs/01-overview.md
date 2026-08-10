# 01 — Overview

## What Artifact Room is

Artifact Room is an **open-source, self-hostable, provider-agnostic host for AI-generated HTML
artifacts**, with **DocSend-grade per-recipient tracking** and access control. Viewers never log in.

It is deliberately **not** a generic static host. Hosting is the commodity floor. The product is
the **share-and-watch loop**: send an interactive artifact to a specific external person, control
who can open it, and learn what they did with it.

> Positioning: **"DocSend for the AI-artifact era — open source, self-hostable, provider-agnostic."**
> DocSend watches dead PDFs; Artifact Room watches live, interactive HTML.

## The problem it solves

Teams now generate interactive HTML artifacts — slide decks, prototypes, dashboards, calculators —
across many tools (Claude, Cursor, v0, OpenAI, and others). When they want to share one with an
**external** partner, prospect, or client, every existing option is bad:

- **Provider sharing is branded and lock-in.** Vendor publish-links carry vendor branding and pull
  viewers into the vendor's funnel; team/enterprise artifacts often can't be made public at all.
- **Generic static hosts** (Netlify Drop, Cloudflare Pages, GitHub Pages) host the file but give no
  access control without a paid tier and no engagement signal.
- **Nothing tells the sender what happened after the send** — did the prospect open it, which slide
  did they dwell on, did they forward it.

The platform vendors structurally **cannot** follow into neutrality — it works against their funnel
interest. That is the seam Artifact Room occupies.

## The mental model: a room

Each share is a **room**. You put an artifact in it, you control the key
(`public` / password / per-recipient), and you watch what happens inside.

```
   artifact  ──►  many shares (rooms)  ──►  viewers open a room by its token
   (the file)     each has its own key       (no login, ever)
                  and its own analytics
```

## Defensibility (wedge → bridge → moat)

| Layer | What it does | Where it lives in the docs |
|---|---|---|
| **Wedge** (gets users) | Agnostic, unbranded ingestion of HTML from any tool | [Features](./07-features.md) |
| **Bridge** (gets contacts) | Access control as a first-class primitive: public / password / per-recipient | [Security](./05-security.md) |
| **Moat** (gets revenue) | Per-recipient identified engagement intelligence — which slide, how long, return visits, forwarding | [Analytics](./06-analytics.md) |

The moat is the reason to build this. The target question is **never** "how many views." It is:

> "Did *this recipient* reach *this slide*, how long did they dwell, did they return, did they
> forward it?"

## What it is not (non-goals)

- **Not** a general static host / Netlify competitor.
- **Not** a place with viewer accounts of any kind — viewers are identified *without* login.
- **Not** a consumer-volume product — the revenue path is B2B/team, sold on analytics (post-MVP).
- **Not** a home for third-party analytics — the analytics are homegrown, because they *are* the moat.

## Privacy as a feature

Cookieless by default, no raw IP retained at rest, EU-friendly. This is a selling point, leaned
into as product — not treated as compliance overhead. See [Analytics](./06-analytics.md) and
[Security](./05-security.md) for how this is enforced in code.

## Licensing & business context

- **OSS core (AGPL-3.0):** agnostic upload, public + password + per-recipient links, basic and
  per-slide analytics, single-team. A *real* product, not crippleware.
- **Commercial (future, out of MVP scope):** managed cloud + paid self-host tier — email-gate,
  identified comments, team roles/audit logs, sender notifications, done-for-you abuse handling.
  Sold per-team/per-seat, B2B. The real paid comparison is DocSend / PandaDoc / Pitch, not Netlify.
