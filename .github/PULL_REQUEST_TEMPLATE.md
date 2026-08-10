<!-- One capability ≈ one PR. See CONTRIBUTING.md. -->

## Summary
<!-- What does this change do, and why? -->

## Design issue
- Issue: #<number> <!-- or label `trivial` -->

## Identity systems touched
<!-- Required. Which of the two systems does this affect, and how does it preserve the boundary? -->
- [ ] Creator (BetterAuth) only
- [ ] Viewer (share token) only
- [ ] Both, at the `share` boundary only (explain below)

## Invariant checklist
- [ ] No new event keys to `artifact` (events key to `share`)
- [ ] No raw IP persisted; cookieless where viewer-facing
- [ ] No viewer account introduced anywhere
- [ ] Untrusted-HTML paths ship CSP/sandbox/scanning in this change
- [ ] Public endpoints are rate-limited + revocable
- [ ] Schema changes are Drizzle migrations, Postgres-portable
- [ ] No invariant in `docs/05-security.md` or `docs/04-data-model.md` crossed

## Tests
- [ ] `typecheck` / `lint`
- [ ] `test:unit`
- [ ] `test:integration`
- [ ] `test:e2e` (this change's flows)

## Notes for reviewers
<!-- Anything tricky, security-relevant, or worth a closer look. -->
