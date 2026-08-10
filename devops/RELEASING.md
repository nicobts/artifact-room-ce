# Releasing (maintainers)

Releases are **tag-driven and fully automated**. A maintainer's job is three
commands; the [`release.yml`](../.github/workflows/release.yml) workflow does
the rest.

## Versioning

Semantic versioning on `v`-prefixed tags:

- `vX.Y.Z` — stable release. Publishes `X.Y.Z`, `X.Y`, `latest`, `sha-<commit>`.
- `vX.Y.Z-rc.N` (any tag containing `-`) — pre-release. Publishes only the
  full version + `sha` tag (never moves `X.Y` or `latest`) and marks the
  GitHub Release as pre-release.

Pre-1.0, minor bumps (`0.Y`) may contain breaking changes — call them out in
the changelog.

## Cutting a release

```bash
# 1. On an up-to-date main with CI green (checks, e2e, image, audit):
git checkout main && git pull

# 2. Update CHANGELOG.md for the version, commit via the normal PR flow.

# 3. Tag and push:
git tag -a v1.2.3 -m "v1.2.3"
git push origin v1.2.3
```

That's it. The tag push triggers `release.yml`, which:

1. **Builds** the image for `linux/amd64` + `linux/arm64` from the root
   [`Dockerfile`](../Dockerfile).
2. **Pushes** to `ghcr.io/nicobts/artifact-room-ce` with the tag fan-out above,
   an attached **CycloneDX SBOM**, and **SLSA provenance** (`mode=max`).
3. **Attests** the build with GitHub's native provenance attestation
   (pushed to the registry, verifiable offline).
4. **Scans** the exact pushed digest with Trivy (CRITICAL/HIGH, fixed-only);
   findings appear under *Security → Code scanning*. The scan runs after the
   push deliberately — a finding turns the run red and raises an alert
   without leaving a half-published release.
5. **Creates the GitHub Release** with auto-generated notes plus the image
   reference and digest. If you drafted the release by hand first, the job
   skips itself.

## Verifying a release

Anyone (not just maintainers) can verify what we publish:

```bash
# Build provenance — proves the image was built by this repo's workflow:
gh attestation verify oci://ghcr.io/nicobts/artifact-room-ce:1.2.3 -R nicobts/artifact-room-ce

# SBOM + SLSA provenance embedded in the image manifest:
docker buildx imagetools inspect ghcr.io/nicobts/artifact-room-ce:1.2.3 \
  --format '{{ json .SBOM }}'
docker buildx imagetools inspect ghcr.io/nicobts/artifact-room-ce:1.2.3 \
  --format '{{ json .Provenance }}'
```

## When something goes wrong

- **Release workflow failed mid-way** — fix the cause, delete the tag
  (`git push origin :refs/tags/v1.2.3`, delete the GitHub Release if created),
  re-tag. Registry tags are overwritten on re-push of the same tag.
- **Bad release already published** — do **not** delete the image (deployments
  may reference it); ship a fixed `vX.Y.Z+1` immediately and note the bad
  version in the changelog. Operators pin exact versions, so `latest` moving
  forward is the fix.
- **CVE reported against the published image** — the weekly
  [`image-scan.yml`](../.github/workflows/image-scan.yml) catches most of
  these; Renovate PRs the base-image bump, and a patch release picks it up.

## Where the pipeline lives

| Concern | File |
|---|---|
| PR/merge gate: typecheck, lint, unit, integration, e2e, **image build + boot smoke test**, `npm audit` | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| Tag → build → GHCR → attest → scan → GitHub Release | [`.github/workflows/release.yml`](../.github/workflows/release.yml) |
| Weekly CVE re-scan of `:latest` | [`.github/workflows/image-scan.yml`](../.github/workflows/image-scan.yml) |
| Static analysis | [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) |
| Dependency updates (incl. pinned base image + action versions) | [`.github/renovate.json`](../.github/renovate.json) |
