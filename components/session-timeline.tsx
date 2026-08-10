import { formatDuration } from "@/lib/format";
import type { TimelineSession } from "@/lib/analytics/queries";

function fmtTime(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * Session timeline for one share (recipient-drilldown). Each viewer session
 * (cookieless `clientId`) with first/last seen, total events, and return-visit
 * (reopen) count. More than one session on a single-recipient share is itself a
 * forwarding signal. Presentational; no client JS. `clientId` is a random,
 * cookieless id (no PII) — shown truncated.
 */
export function SessionTimeline({ sessions }: { sessions: TimelineSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No viewer sessions yet for this recipient.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {sessions.map((s, i) => {
        const dwell =
          s.lastSeenAt != null
            ? s.lastSeenAt.getTime() - s.firstSeenAt.getTime()
            : 0;
        return (
          <li key={s.id} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-1 size-2 shrink-0 rounded-full bg-primary"
            />
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">
                Session {i + 1}
                <code className="ml-2 text-xs font-normal text-muted-foreground">
                  {s.clientId.slice(0, 8)}…
                </code>
                {i > 0 && (
                  <span className="ml-2 text-xs font-medium text-warning">
                    additional client
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                First seen {fmtTime(s.firstSeenAt)}
                {s.lastSeenAt != null && ` · ${formatDuration(dwell)} on page`}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {s.events} events · {s.reopens} reopen{s.reopens === 1 ? "" : "s"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
