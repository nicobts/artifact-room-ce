import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OverviewCards } from "@/components/overview-cards";
import { RecentActivity } from "@/components/recent-activity";
import { TopArtifacts } from "@/components/top-artifacts";
import { getCreatorSession } from "@/lib/session";
import { getAccountOverview } from "@/lib/analytics/queries";

export default async function DashboardPage() {
  const session = await getCreatorSession();
  if (!session) return null; // (creator) layout guards; satisfies the type

  const overview = getAccountOverview(session.user.id);

  if (overview.totals.artifacts === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Welcome to Artifact Room
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Upload an HTML artifact, share it with a public or per-recipient
            link, and watch who opens it, which slide they dwell on, and whether
            it gets forwarded.
          </p>
        </div>
        <Button asChild>
          <Link href="/artifacts">Upload your first artifact</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      <OverviewCards totals={overview.totals} />
      <div className="flex flex-col gap-4 px-4 lg:flex-row lg:px-6">
        <RecentActivity items={overview.recentActivity} />
        <TopArtifacts items={overview.topArtifacts} />
      </div>
    </div>
  );
}
