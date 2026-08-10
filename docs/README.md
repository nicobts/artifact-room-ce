# Artifact Room — Documentation

**DocSend for the AI-artifact era — open source, self-hostable, provider-agnostic.**

Host AI-generated HTML artifacts, share them with a specific external person through an
unbranded link, and see exactly what they did with it — which slide they dwelt on, whether
they returned, whether they forwarded it.

This `docs/` folder is the **reference for the platform**: it describes the system
that actually ships in this repository.

## How the documentation fits together

| Document | Role | Authority |
|---|---|---|
| [`prd.md`](../prd.md) | Product intent — problem, positioning, scope, business model | Source of truth for **why** |
| [`04-data-model.md`](./04-data-model.md) | The schema and its invariants | Source of truth for **the data spine** |
| [`05-security.md`](./05-security.md) | The security model and the invariants never crossed | Source of truth for **the boundaries** (wins on any conflict) |
| **`docs/` (the rest of this folder)** | As-built reference — architecture, features, components, APIs as they exist in code | Descriptive; defers to the three above |

> **Precedence rule.** Where anything here disagrees with `05-security.md` or
> `04-data-model.md`, those win and the other doc is the bug. These docs
> describe the code, not the other way around.

## Reading order

New to the project? Read in order:

1. [Overview](./01-overview.md) — what this is and the mental model
2. [Architecture](./02-architecture.md) — the two-origin / two-identity spine
3. [Stack](./03-stack.md) — every dependency and why it's here
4. [Data model](./04-data-model.md) — the schema and its invariants
5. [Security model](./05-security.md) — the load-bearing wall
6. [Analytics — the moat](./06-analytics.md) — identified per-recipient engagement

Reference material:

7. [Feature catalog](./07-features.md) — capabilities and their build status
8. [Component inventory](./08-components.md) — UI across the three surfaces
9. [API reference](./09-api-reference.md) — every endpoint
10. [Configuration & deployment](./10-configuration.md) — env, Docker, backups
11. [Development & testing](./11-development.md) — local dev, testing standard, Definition of Done

## Status

**MVP complete.** The ten core capabilities plus several post-MVP enhancements are
implemented and tested (unit + integration + e2e), with typecheck/lint/build green. Pre-1.0:
APIs may still shift. See the [feature catalog](./07-features.md) for per-capability status.
