import { formatDuration } from "@/lib/format";
import type { FunnelSlide } from "@/lib/analytics/queries";

/**
 * Per-slide dwell funnel for one share (recipient-drilldown). Two signals per
 * slide: how many sessions REACHED it (the funnel/drop-off bar) and how much
 * total time was spent on it (dwell). Presentational; no client JS.
 */
export function SlideFunnel({
  slides,
  regionKind,
  regionLabels,
}: {
  slides: FunnelSlide[];
  regionKind?: string | null;
  regionLabels?: (string | null)[] | null;
}) {
  if (slides.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No per-slide activity recorded for this recipient yet.
      </p>
    );
  }
  const maxReached = Math.max(...slides.map((s) => s.reached), 1);
  const maxDwell = Math.max(...slides.map((s) => s.totalMs), 1);
  const top = slides[0].reached;

  return (
    <div className="flex flex-col gap-2">
      {slides.map((s, i) => {
        const dropped = i > 0 && s.reached < slides[i - 1].reached;
        const label =
          regionLabels?.[s.slideIndex] ??
          (regionKind === "sections" ? `Part ${s.slideIndex + 1}` : `Slide ${s.slideIndex + 1}`);
        return (
          <div key={s.slideIndex} className="flex items-center gap-3 text-xs">
            <span
              className="w-20 shrink-0 truncate text-muted-foreground"
              title={label}
            >
              {label}
            </span>
            <div className="flex flex-1 flex-col gap-1">
              {/* Reached / funnel bar */}
              <div className="h-3 w-full overflow-hidden rounded bg-muted">
                <div
                  className={`h-full rounded ${dropped ? "bg-warning" : "bg-primary"}`}
                  style={{ width: `${Math.round((s.reached / maxReached) * 100)}%` }}
                />
              </div>
              {/* Dwell bar (lighter) */}
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted/60">
                <div
                  className="h-full rounded bg-primary/40"
                  style={{ width: `${Math.round((s.totalMs / maxDwell) * 100)}%` }}
                />
              </div>
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
              {s.reached}/{top} reached
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatDuration(s.totalMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
