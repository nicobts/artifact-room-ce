import type { ActivityItem } from "@/lib/analytics/queries";

/** Human dwell/duration, e.g. 4000 -> "4s", 65000 -> "1m 05s". Pure. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m === 0 ? `${s}s` : `${m}m ${s.toString().padStart(2, "0")}s`;
}

/** Human byte size, e.g. 2048 -> "2.0 KB". Returns "—" for null/0. Pure. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

const VERB: Record<ActivityItem["type"], string> = {
  view: "opened",
  slide_view: "viewed a slide of",
  dwell: "spent time on",
  reopen: "reopened",
  forward_suspected: "forwarded (suspected)",
};

/** One human line for the recent-activity feed. Pure. */
export function activityLine(item: ActivityItem): string {
  const who =
    item.recipientLabel ?? (item.shareMode === "public" ? "Someone" : "A recipient");
  const verb = VERB[item.type] ?? "acted on";
  const slide = item.slideIndex != null ? ` (slide ${item.slideIndex})` : "";
  return `${who} ${verb} “${item.artifactTitle}”${slide}`;
}
