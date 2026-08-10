import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ViewsChart } from "@/components/views-chart";
import { ForwardingAlerts } from "@/components/forwarding-alerts";
import { SharesTable, type SharesTableRow } from "@/components/shares-table";
import { TrackingGuidance } from "@/components/tracking-guidance";
import { getCreatorSession } from "@/lib/session";
import {
  getViewsTimeSeries,
  listSharesWithStats,
} from "@/lib/analytics/queries";

export default async function AnalyticsPage() {
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards

  const shares = listSharesWithStats(session.user.id);
  const series = getViewsTimeSeries(session.user.id, 14);

  if (shares.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">No analytics yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Create a share for one of your artifacts. Once it&apos;s opened,
            per-recipient views, dwell, and forwarding signals show up here.
          </p>
        </div>
        <Button asChild>
          <Link href="/artifacts">Go to artifacts</Link>
        </Button>
      </div>
    );
  }

  const rows: SharesTableRow[] = shares.map((s) => ({
    id: s.id,
    artifactId: s.artifactId,
    artifactTitle: s.artifactTitle,
    recipientLabel: s.recipientLabel,
    mode: s.mode,
    protection: s.protection,
    status: s.status,
    views: s.stats.views,
    uniqueViewers: s.stats.uniqueViewers,
    reopens: s.stats.reopens,
    forwards: s.stats.forwards,
    avgDwellMs: s.avgDwellMs,
    perSlideDwellMs: s.stats.perSlideDwellMs,
    coverage: s.coverage,
  }));

  const alerts = rows
    .filter((r) => r.forwards > 0)
    .map((r) => ({
      shareId: r.id,
      artifactTitle: r.artifactTitle,
      recipientLabel: r.recipientLabel,
      forwards: r.forwards,
    }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      <ViewsChart data={series} />
      <ForwardingAlerts alerts={alerts} />
      <TrackingGuidance />
      <SharesTable rows={rows} />
    </div>
  );
}
