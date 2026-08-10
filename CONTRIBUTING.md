# Contributing to Artifact Room

> ## ⏸️ Not accepting contributions yet
>
> The code is public, but contributions are **paused** while the Contributor
> Licence Agreement completes legal review. Issues are disabled for the same
> reason.
>
> This is deliberate, and it protects you as much as the project. Artifact Room
> is open-core: this AGPL-3.0 edition and a commercial edition are built from
> the same code, which is only possible if every contribution can be
> relicensed. That rests entirely on the CLA — and asking anyone to sign one
> before a lawyer has read it would not be fair.
>
> Everything below is accurate and ready; it takes effect the moment the review
> clears. **Please don't open a pull request until then** — it would sit
> unmergeable, which wastes your time.
>
> Reading the code, running it, self-hosting it, and filing security reports
> through [`SECURITY.md`](./SECURITY.md) are all unaffected.

Thanks for considering a contribution. This project agrees on a design in an issue before code is written, and it is **security-sensitive** — the workflow below exists to keep both qualities intact. Please read it before opening a PR.

## Ground rules (read these first)

This project is security-sensitive and has invariants that outrank code quality.
They are not optional reading:
- **[`docs/05-security.md`](./docs/05-security.md)** — the security model and the invariants that are never crossed.
- **[`docs/04-data-model.md`](./docs/04-data-model.md)** — the schema and the invariants a change is rejected for violating.
- **[`docs/11-development.md`](./docs/11-development.md)** — the testing standard and the Definition of Done.
- **[`prd.md`](./prd.md)** — product intent and positioning.

A change that crosses one of those invariants will be declined regardless of
code quality.

## The workflow: agree on the design first

1. **Open an issue before writing feature code.** For anything beyond a trivial
   fix, describe the problem, your proposed solution, and the alternatives you
   considered, and let it be discussed *before* the implementation exists. We
   catch architectural drift in a paragraph, not in 500 lines.
2. **One capability per pull request.** Big features decompose into several.
3. **Branch per change**, and reference the issue in the PR.

## Definition of Done (every change)

See [`docs/11-development.md`](./docs/11-development.md) for the authoritative list. In short, a change is done only when:
- The design was agreed in an issue before implementation.
- Schema changes are Drizzle migrations, Postgres-portable.
- Identity-system separation is respected and stated (which system does it touch?).
- If it touches untrusted HTML: CSP/sandbox/scanning ship **in the same change**.
- If it adds an event type: retention + privacy documented; events key to `share`, never `artifact`.
- Public endpoints are rate-limited and revocable.
- Tests proportionate to risk pass (unit + integration + the change's e2e flows).
- Any UI is built shadcn-first to the production-grade bar (a11y AA, responsive, good Core Web Vitals).
- No invariant in `docs/05-security.md` or `docs/04-data-model.md` is crossed.

## Local development

```bash
npm ci
npm run dev          # serves app.localhost:3000 and view.localhost:3000 (two origins, one server)
npm run test:unit
npm run test:integration
npm run test:e2e     # Playwright across both origins
```
Browsers resolve `*.localhost` to 127.0.0.1 automatically — no hosts-file edits needed.

## Pull request checklist

- [ ] Linked to an issue with an agreed design (or labeled `trivial`).
- [ ] `typecheck`, `lint`, `test:unit`, `test:integration`, `test:e2e` pass locally.
- [ ] States which identity system(s) it touches.
- [ ] Untrusted-HTML paths ship their CSP/sandbox/scanning story.
- [ ] No new event keys to `artifact`; no raw IP persisted; no viewer account introduced.
- [ ] Docs under `docs/` updated to match what now ships.

## Security

Never report a vulnerability in a public issue or PR. See [`SECURITY.md`](./SECURITY.md).

## Code of Conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Contributor License Agreement (CLA)

Artifact Room is an open-core project: this AGPL-3.0 community edition and a
commercial edition are built from the same code, which is only legally
possible when every contribution can be relicensed. Before your first pull
request can merge, you must sign the
[Individual Contributor License Agreement](./CLA.md) — once, and it covers
all your future contributions. The CLA bot prompts on your first PR; sign by
replying with:

> I have read the CLA Document and I hereby sign the CLA

By contributing you also agree that your contribution is licensed to
everyone under the project's [AGPL-3.0 License](./LICENSE).
