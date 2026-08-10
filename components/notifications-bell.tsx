"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FeedItem {
  id: string;
  type: "first_open" | "reopen" | "forward_suspected";
  line: string;
  href: string;
  createdAt: number;
  unread: boolean;
}

function timeAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Header notifications bell (open-notifications). Polls the creator-side feed
 * (first-open / reopen / forward signals). Opening the feed marks everything
 * seen (clears the unread badge); each item links to that share's drill-down.
 * No viewer/beacon coupling — this only reads the creator's own projection.
 */
export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = React.useState<FeedItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [now, setNow] = React.useState(() => 0);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/creator/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: FeedItem[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
      setNow(Date.now());
    } catch {
      /* offline / transient — keep last state */
    }
  }, []);

  React.useEffect(() => {
    // Subscribe to an external system (the notifications feed): fetch once on
    // mount, then poll. setState happens asynchronously after each fetch — the
    // "subscribe for updates from an external system" case the rule endorses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function markSeen() {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })));
    try {
      await fetch("/api/creator/notifications/seen", { method: "POST" });
    } catch {
      /* best-effort; next load reconciles */
    }
  }

  function onOpenChange(open: boolean) {
    // On open, mark seen (clears the badge). Don't refetch here: a concurrent
    // load() computes unread against the OLD watermark and would race-overwrite
    // the optimistic clear. The mount fetch + 60s poll keep the feed fresh.
    if (open) void markSeen();
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
      >
        <BellIcon className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <span className="text-xs text-muted-foreground">
            {unread > 0 ? `${unread} new` : "all caught up"}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No opens yet. When a recipient opens a share, it shows up here.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {items.map((it) => {
              const forwarded = it.type === "forward_suspected";
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => router.push(it.href)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        it.unread
                          ? forwarded
                            ? "bg-warning"
                            : "bg-primary"
                          : "bg-transparent"
                      }`}
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className={forwarded ? "text-warning" : ""}>
                        {it.line}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(it.createdAt, now || it.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
