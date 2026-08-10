import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArtifactPreview } from "@/components/artifact-preview";
import { ArtifactReplace } from "@/components/artifact-replace";
import { CreateShareForm } from "@/components/create-share-form";
import { ShareRowActions } from "@/components/share-row-actions";
import { getCreatorSession } from "@/lib/session";
import { getArtifact } from "@/lib/artifacts";
import { listShares, shareUrl } from "@/lib/share";
import { getShareStats, getArtifactStats } from "@/lib/analytics/queries";
import { activityLine, formatBytes, formatDuration } from "@/lib/format";

function shareStatus(s: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): "active" | "revoked" | "expired" {
  if (s.revokedAt) return "revoked";
  if (s.expiresAt && s.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
}

function fmtDate(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Small badge describing how regions were detected for a share, or null when unknown. */
function regionBadge(regionKind: string | undefined, count: number) {
  switch (regionKind) {
    case "sections":
      return <Badge variant="outline">{count} sections (annotated)</Badge>;
    case "slides":
      return <Badge variant="outline">{count} slides</Badge>;
    case "scroll":
      return <Badge variant="outline">scroll depth (auto)</Badge>;
    case "document":
      return <Badge variant="outline">single page</Badge>;
    default:
      return null;
  }
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`text-2xl font-semibold tabular-nums ${warn ? "text-warning" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards; this satisfies the type

  const art = getArtifact(session.user.id, id);
  if (!art) notFound();

  const shares = listShares(session.user.id, id);
  const stats = getArtifactStats(session.user.id, id);
  const advisories = (art.scanAdvisories as string[] | null) ?? [];
  const totalDwellMs = stats.perSlideDwellMs.reduce((n, d) => n + d.totalMs, 0);
  const avgDwellMs = stats.views > 0 ? Math.round(totalDwellMs / stats.views) : 0;
  const maxDwell = Math.max(...stats.perSlideDwellMs.map((d) => d.totalMs), 1);
  // Computed once per share and reused below (share list) and here (recap
  // badge, from the latest share — listShares orders by createdAt desc) so
  // there's exactly one getShareStats call per share, not two.
  const shareStatsById = new Map(shares.map((s) => [s.id, getShareStats(s.id)]));
  const latestShareDetection = shares.length > 0 ? shareStatsById.get(shares[0].id)!.detection : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/artifacts"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Artifacts
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{art.title}</h1>
          {art.version > 1 && (
            <Badge variant="outline" className="font-normal">
              v{art.version}
            </Badge>
          )}
          <div className="ml-auto">
            <ArtifactReplace artifactId={art.id} version={art.version} />
          </div>
        </div>
      </div>

      <ArtifactPreview artifactId={art.id} />

      {/* Details / metadata */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">
            Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Meta label="Uploaded" value={fmtDate(art.createdAt)} />
          <Meta label="Type" value={art.contentType} />
          <Meta label="Slides" value={art.slideCount ?? "—"} />
          <Meta label="Version" value={`v${art.version}`} />
          <Meta label="Size" value={formatBytes(art.sizeBytes)} />
          <Meta label="Shares" value={shares.length} />
          <Meta
            label="Scan"
            value={
              advisories.length === 0 ? (
                "clean"
              ) : (
                <span className="flex flex-wrap gap-1">
                  {advisories.map((a) => (
                    <Badge key={a} variant="outline" className="text-[10px]">
                      {a}
                    </Badge>
                  ))}
                </span>
              )
            }
          />
        </CardContent>
      </Card>

      {/* Analytics recap (aggregated across this artifact's shares) */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold tracking-tight">
              Analytics recap
            </CardTitle>
            {regionBadge(latestShareDetection?.kind, latestShareDetection?.count ?? 0)}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Views" value={stats.views.toLocaleString()} />
            <Stat label="Unique" value={stats.uniqueViewers.toLocaleString()} />
            <Stat label="Reopens" value={stats.reopens.toLocaleString()} />
            <Stat
              label="Forwarded"
              value={stats.forwards > 0 ? `⚠ ${stats.forwards}` : "0"}
              warn={stats.forwards > 0}
            />
            <Stat label="Avg dwell" value={formatDuration(avgDwellMs)} />
            <Stat
              label="Avg coverage"
              value={stats.avgCoverage != null ? `${Math.round(stats.avgCoverage * 100)}%` : "—"}
            />
          </div>
          {stats.perSlideDwellMs.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Per-slide dwell
              </span>
              {stats.perSlideDwellMs.map((d) => (
                <div key={d.slideIndex} className="flex items-center gap-2 text-xs">
                  <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                    s{d.slideIndex}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${Math.round((d.totalMs / maxDwell) * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                    {formatDuration(d.totalMs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent events for this artifact */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">
            Recent events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity yet for this artifact.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.recentEvents.map((e, i) => {
                const forwarded = e.type === "forward_suspected";
                return (
                  <li key={i} className="flex items-start gap-2 leading-snug">
                    <span
                      aria-hidden
                      className={`mt-1 size-2 shrink-0 rounded-full ${forwarded ? "bg-warning" : "bg-muted-foreground/40"}`}
                    />
                    <span className={forwarded ? "text-warning" : ""}>
                      {activityLine(e)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Share management */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Shares</h2>
        <CreateShareForm artifactId={art.id} />
        {shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shares yet. Create one above.
          </p>
        ) : (
          shares.map((s) => {
            const status = shareStatus(s);
            const sstats = shareStatsById.get(s.id)!;
            return (
              <Card key={s.id} className="shadow-sm">
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant={s.mode === "recipient" ? "default" : "secondary"}
                    >
                      {s.mode}
                    </Badge>
                    {s.recipientLabel && (
                      <span className="text-sm">{s.recipientLabel}</span>
                    )}
                    {s.passwordHash && <Badge variant="outline">password</Badge>}
                    <Badge
                      variant={status === "active" ? "secondary" : "destructive"}
                    >
                      {status}
                    </Badge>
                    <code className="ml-auto max-w-[16rem] truncate text-xs text-muted-foreground">
                      {shareUrl(s.token)}
                    </code>
                    <ShareRowActions
                      shareId={s.id}
                      url={shareUrl(s.token)}
                      revoked={Boolean(s.revokedAt)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{sstats.views} views</span>
                    <span>{sstats.uniqueViewers} unique</span>
                    <span>{sstats.reopens} reopens</span>
                    {sstats.forwards > 0 ? (
                      <span className="font-medium text-warning">
                        ⚠ {sstats.forwards} forwarded
                      </span>
                    ) : (
                      <span>0 forwarded</span>
                    )}
                    <Link
                      href={`/artifacts/${art.id}/shares/${s.id}`}
                      className="ml-auto font-medium text-primary hover:underline"
                    >
                      Recipient detail →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
