import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SlideFunnel } from "@/components/slide-funnel";
import { SessionTimeline } from "@/components/session-timeline";
import { getCreatorSession } from "@/lib/session";
import { getShareStats, getShareTimeline } from "@/lib/analytics/queries";
import { shareUrl } from "@/lib/share";
import { formatDuration } from "@/lib/format";

function fmtDate(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Small badge describing how regions were detected for this share, or null when unknown. */
function regionBadge(regionKind: string | null, count: number) {
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

export default async function ShareDrilldownPage({
  params,
}: {
  params: Promise<{ id: string; shareId: string }>;
}) {
  const { id, shareId } = await params;
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards

  const tl = getShareTimeline(session.user.id, shareId);
  // Not owned, or the share doesn't belong to the artifact in the URL → 404
  // (no existence leak either way).
  if (!tl || tl.artifactId !== id) notFound();

  // getShareTimeline doesn't expose coverage/detection.count directly (only
  // regionKind/regionLabels) — one extra getShareStats call for the real count.
  const shareStats = getShareStats(shareId);
  const coverage = shareStats.coverage;
  const regionCount = shareStats.detection?.count ?? 0;
  const showTrackingNudge = tl.regionKind === "scroll" || tl.regionKind === "document";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/artifacts/${tl.artifactId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {tl.artifactTitle}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {tl.recipientLabel ?? (tl.mode === "public" ? "Public link" : "Recipient")}
          </h1>
          <Badge variant={tl.mode === "recipient" ? "default" : "secondary"}>
            {tl.mode}
          </Badge>
          <Badge variant={tl.status === "active" ? "secondary" : "destructive"}>
            {tl.status}
          </Badge>
          <code className="ml-auto max-w-[20rem] truncate text-xs text-muted-foreground">
            {shareUrl(tl.token)}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">
          Share created {fmtDate(tl.createdAt)}
        </p>
      </div>

      {/* Headline totals for this one recipient */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">
            Engagement
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Views" value={tl.totals.views.toLocaleString()} />
          <Stat label="Unique" value={tl.totals.uniqueViewers.toLocaleString()} />
          <Stat label="Reopens" value={tl.totals.reopens.toLocaleString()} />
          <Stat
            label="Forwarded"
            value={tl.totals.forwards > 0 ? `⚠ ${tl.totals.forwards}` : "0"}
            warn={tl.totals.forwards > 0}
          />
          <Stat label="Total time" value={formatDuration(tl.totals.totalDwellMs)} />
        </CardContent>
      </Card>

      {/* Per-slide dwell funnel (reached vs. drop-off) */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold tracking-tight">
              Per-slide funnel
            </CardTitle>
            {regionBadge(tl.regionKind, regionCount)}
            {/*
              Scope the promise honestly. Region detection is heuristic, and
              when an artifact carries no section or slide markup the fallback
              infers structure from scroll depth rather than reading it — so
              coverage is an estimate, not a measurement. A creator deciding
              whether to act on this number deserves to know that up front.
            */}
            <Badge
              variant="secondary"
              title="Region detection is heuristic; without section or slide markup, structure is inferred from scroll depth rather than read. Treat coverage as an estimate."
            >
              Experimental
            </Badge>
          </div>
          <CardAction className="flex flex-col items-end gap-1">
            <Stat
              label="Coverage"
              value={coverage != null ? `${Math.round(coverage * 100)}%` : "—"}
            />
            {showTrackingNudge && (
              <Link
                href="/analytics#improve-tracking"
                className="text-xs text-muted-foreground hover:underline"
              >
                Add sections for richer insight →
              </Link>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <SlideFunnel
            slides={tl.funnel}
            regionKind={tl.regionKind}
            regionLabels={tl.regionLabels}
          />
        </CardContent>
      </Card>

      {/* Session timeline (return visits / forwarding) */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">
            Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SessionTimeline sessions={tl.sessions} />
        </CardContent>
      </Card>

      {/* Suspected forwarding */}
      {tl.forwards.length > 0 && (
        <Card className="border-warning/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-warning">
              Suspected forwarding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {tl.forwards.map((f) => (
                <li key={f.id} className="text-muted-foreground">
                  A new client opened this token — {fmtDate(f.createdAt)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
