import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActivityItem } from "@/lib/analytics/queries";
import { activityLine } from "@/lib/format";

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="flex-1 shadow-sm">
      <CardHeader className="border-b [.border-b]:pb-4">
        <CardTitle className="text-base font-semibold tracking-tight">
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet. Views and dwell appear here once a recipient opens a
            shared artifact.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item, i) => {
              const forwarded = item.type === "forward_suspected";
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm leading-snug"
                >
                  <span
                    aria-hidden
                    className={
                      forwarded
                        ? "mt-1 size-2 shrink-0 rounded-full bg-warning"
                        : "mt-1 size-2 shrink-0 rounded-full bg-muted-foreground/40"
                    }
                  />
                  <span className={forwarded ? "text-warning" : ""}>
                    {activityLine(item)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
