import {
  FileTextIcon,
  Share2Icon,
  EyeIcon,
  UsersIcon,
  ForwardIcon,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountTotals } from "@/lib/analytics/queries";
import { cn } from "@/lib/utils";

const META: {
  key: keyof AccountTotals;
  label: string;
  icon: LucideIcon;
  warn?: boolean;
}[] = [
  { key: "artifacts", label: "Artifacts", icon: FileTextIcon },
  { key: "shares", label: "Shares", icon: Share2Icon },
  { key: "views", label: "Views", icon: EyeIcon },
  { key: "uniqueViewers", label: "Unique viewers", icon: UsersIcon },
  { key: "forwards", label: "Forwarded", icon: ForwardIcon, warn: true },
];

export function OverviewCards({ totals }: { totals: AccountTotals }) {
  return (
    <div className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-5 lg:px-6">
      {META.map((m) => {
        const value = totals[m.key];
        const warn = Boolean(m.warn && value > 0);
        const Icon = m.icon;
        return (
          <Card
            key={m.key}
            className={cn(
              "relative shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md [--card-spacing:--spacing(5)]",
              warn && "ring-warning/40",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
                warn
                  ? "from-warning/70 to-warning/20"
                  : "from-primary/50 to-ember/30",
              )}
            />
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </span>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary",
                    warn && "bg-warning/15 text-warning",
                  )}
                >
                  <Icon className="size-4" />
                </span>
              </div>
              <div
                className={cn(
                  "text-4xl font-semibold tabular-nums tracking-tight",
                  warn && "text-warning",
                )}
              >
                {value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
