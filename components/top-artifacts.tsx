import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TopArtifact } from "@/lib/analytics/queries";
import { formatDuration } from "@/lib/format";

export function TopArtifacts({ items }: { items: TopArtifact[] }) {
  return (
    <Card className="flex-1 shadow-sm">
      <CardHeader className="border-b [.border-b]:pb-4">
        <CardTitle className="text-base font-semibold tracking-tight">
          Top artifacts by engagement
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing measured yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((a, i) => (
              <li key={a.artifactId} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ember/10 text-xs font-semibold text-ember tabular-nums">
                  {i + 1}
                </span>
                <Link
                  href={`/artifacts/${a.artifactId}`}
                  className="truncate font-medium hover:underline"
                >
                  {a.title}
                </Link>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {a.views.toLocaleString()} views · {formatDuration(a.avgDwellMs)} avg
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
